import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server Component'lerden ve Server Action'lardan API'ye giden TEK kapı.
 *
 * Tek yer olması önemli: çerezi ileten tek yer burası, 401'i /login'e çeviren
 * tek yer burası. Her sayfanın kendi fetch'ini yazması, birinin cookie'yi
 * unutması demekti.
 *
 * Tarayıcıdan yapılan istekler bu dosyadan GEÇMEZ; onlar /backend/... adresine
 * gider ve çerezleri tarayıcı kendisi ekler.
 */

const API_BASE = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** 401'de yönlendirme yerine hata fırlat (login formu kendi mesajını gösterir). */
  throwOnUnauthorized?: boolean;
  /** Yanıttaki Set-Cookie başlıklarını da döndür (login/refresh için). */
  withSetCookie?: boolean;
};

export type ApiResponse<T> = { data: T; setCookie: string[] };

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  // Next 16: cookies() artık asenkron.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      // Express'in originCheck middleware'i durum değiştiren isteklerde
      // Origin bekliyor; sunucudan sunucuya çağrıda tarayıcı eklemiyor.
      ...(options.method && options.method !== "GET"
        ? { origin: process.env.PANEL_ORIGIN ?? "http://localhost:3000" }
        : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    // Panel verisi her zaman taze olmalı: cache'lenmiş bir KPI kartı yanlış
    // karar aldırır.
    cache: "no-store",
  });

  const setCookie = options.withSetCookie ? readSetCookie(response) : [];

  if (response.status === 401 && !options.throwOnUnauthorized) {
    redirect("/login");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;

    throw new ApiError(
      response.status,
      payload?.error?.code ?? "UNKNOWN",
      payload?.error?.message ?? `İstek başarısız (HTTP ${response.status})`,
      payload?.error?.details,
    );
  }

  if (response.status === 204) {
    return { data: undefined as T, setCookie };
  }

  return { data: (await response.json()) as T, setCookie };
}

/** Çoğu çağrı yalnızca gövdeyle ilgilenir. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await apiRequest<T>(path, options);
  return data;
}

function readSetCookie(response: Response): string[] {
  // Undici'nin getSetCookie'si her başlığı ayrı döner; birleştirilmiş
  // response.headers.get("set-cookie") çoklu çerezi bozar.
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();

  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

/** Sorgu dizesini kurar; boş değerler atlanır. */
export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
