"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import type { User } from "@/types/api";

/**
 * Tüm mutasyonlar Server Action.
 *
 * Böylece istemci tarafında bir mutasyon durum makinesi (loading/error/retry)
 * tutmaya gerek kalmıyor ve API adresleri tarayıcı paketine hiç girmiyor.
 */

export type FormState = { error?: string };

/**
 * Express'in ürettiği Set-Cookie başlıklarını Next'in çerez deposuna aktarır.
 *
 * Bu köprü şart: fetch sunucudan sunucuya yapıldığı için tarayıcı çerezleri
 * kendiliğinden almıyor.
 */
async function forwardSetCookies(setCookie: string[]): Promise<void> {
  const store = await cookies();

  for (const raw of setCookie) {
    const [pair, ...attributes] = raw.split(";");
    const separatorIndex = pair?.indexOf("=") ?? -1;
    if (!pair || separatorIndex < 0) continue;

    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();

    const options: Parameters<typeof store.set>[2] = {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    };

    for (const attribute of attributes) {
      const [key, attrValue] = attribute.split("=").map((part) => part.trim());
      const lower = key?.toLowerCase();

      if (lower === "expires" && attrValue) options.expires = new Date(attrValue);
      if (lower === "max-age" && attrValue) options.maxAge = Number(attrValue);
      if (lower === "secure") options.secure = true;
      if (lower === "domain" && attrValue) options.domain = attrValue;
    }

    store.set(name, value, options);
  }
}

export async function loginAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "E-posta ve şifre gerekli." };
  }

  try {
    const { setCookie } = await apiRequest<{ user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      throwOnUnauthorized: true,
      withSetCookie: true,
    });

    await forwardSetCookies(setCookie);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Giriş yapılamadı. Sunucuya ulaşılamıyor olabilir." };
  }

  // redirect() içeride bir hata fırlatarak çalışır; try bloğunun DIŞINDA olmalı,
  // yoksa catch onu yakalar ve yönlendirme sessizce kaybolur.
  redirect("/");
}

export async function registerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!companyName || !fullName || !email || !password) {
    return { error: "Tüm alanlar gerekli." };
  }

  try {
    const { setCookie } = await apiRequest<{ user: User }>("/auth/register", {
      method: "POST",
      body: { companyName, fullName, email, password },
      throwOnUnauthorized: true,
      withSetCookie: true,
    });

    await forwardSetCookies(setCookie);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Kayıt yapılamadı. Sunucuya ulaşılamıyor olabilir." };
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  try {
    const { setCookie } = await apiRequest<void>("/auth/logout", {
      method: "POST",
      throwOnUnauthorized: true,
      withSetCookie: true,
    });
    await forwardSetCookies(setCookie);
  } catch {
    // Çıkışta sunucu hatası kullanıcıyı sisteme kilitlememeli: çerezleri
    // yerelde de temizleyip devam ediyoruz.
    const store = await cookies();
    store.delete("va_at");
    store.delete("va_rt");
  }

  redirect("/login");
}
