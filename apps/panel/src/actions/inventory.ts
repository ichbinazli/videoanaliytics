"use server";

import { revalidatePath } from "next/cache";
import { ApiError, api } from "@/lib/api";
import type { ApiKeyMetadata, Device, Site } from "@/types/api";

/**
 * Envanter mutasyonları.
 *
 * Hepsi Server Action: istemci tarafında fetch/loading/error üçlüsünü yeniden
 * kurmak yerine, form gönderiliyor ve revalidatePath ile sayfa tazeleniyor.
 */

export type ActionState = { error?: string; success?: string };

/** API hatalarını forma gösterilebilir bir mesaja çevirir. */
function toState(error: unknown): ActionState {
  if (error instanceof ApiError) return { error: error.message };
  return { error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." };
}

export async function createSiteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await api<{ site: Site }>("/sites", {
      method: "POST",
      body: {
        name: String(formData.get("name") ?? "").trim(),
        code: String(formData.get("code") ?? "").trim(),
        city: String(formData.get("city") ?? "").trim() || null,
      },
      throwOnUnauthorized: true,
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/sites");
  return { success: "Mağaza oluşturuldu." };
}

export async function createDeviceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await api<{ device: Device }>("/devices", {
      method: "POST",
      body: {
        siteId: Number(formData.get("siteId")),
        name: String(formData.get("name") ?? "").trim(),
        code: String(formData.get("code") ?? "").trim(),
        screenLabel: String(formData.get("screenLabel") ?? "").trim() || null,
      },
      throwOnUnauthorized: true,
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/devices");
  return { success: "Cihaz oluşturuldu." };
}

export type IssueKeyState = ActionState & { plaintext?: string };

/**
 * Yeni cihaz API key'i üretir.
 *
 * Düz metin key BU YANITTA bir kez döner; sunucu hash'inden geri üretemez.
 * Bu yüzden state içinde taşıyıp kullanıcıya kopyalatıyoruz.
 */
export async function issueApiKeyAction(
  _previous: IssueKeyState,
  formData: FormData,
): Promise<IssueKeyState> {
  const deviceId = Number(formData.get("deviceId"));
  const rotate = formData.get("rotate") === "on";

  try {
    const response = await api<{ key: ApiKeyMetadata; plaintext: string }>(
      `/devices/${deviceId}/api-keys`,
      {
        method: "POST",
        body: { rotate, label: String(formData.get("label") ?? "").trim() || undefined },
        throwOnUnauthorized: true,
      },
    );

    revalidatePath(`/devices/${deviceId}`);
    return { success: "Key üretildi.", plaintext: response.plaintext };
  } catch (error) {
    return toState(error);
  }
}

export async function revokeApiKeyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const deviceId = Number(formData.get("deviceId"));
  const keyId = Number(formData.get("keyId"));

  try {
    await api(`/devices/${deviceId}/api-keys/${keyId}`, {
      method: "DELETE",
      throwOnUnauthorized: true,
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/devices/${deviceId}`);
  return { success: "Key iptal edildi." };
}
