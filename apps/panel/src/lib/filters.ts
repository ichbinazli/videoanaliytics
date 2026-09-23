/**
 * Filtre durumu URL'DE yaşar, React state'inde değil.
 *
 * Sebep: her filtre kombinasyonu paylaşılabilir ve yer imine eklenebilir bir
 * adres olur; geri tuşu beklendiği gibi çalışır; ve Server Component'ler
 * yeniden render olurken invalidate edilecek bir client cache kalmaz.
 */

export type DateRangePreset = "24h" | "7d" | "30d" | "90d";

export const RANGE_PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "24h", label: "Son 24 saat" },
  { value: "7d", label: "Son 7 gün" },
  { value: "30d", label: "Son 30 gün" },
  { value: "90d", label: "Son 90 gün" },
];

const PRESET_MS: Record<DateRangePreset, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

export type AnalyticsFilters = {
  range: DateRangePreset;
  from: string;
  to: string;
  siteId?: string;
  deviceId?: string;
};

/**
 * Next 16'da searchParams asenkron; çağıran taraf await edip düz nesneyi verir.
 * Tanınmayan bir preset sessizce varsayılana düşer — eski bir linki açan
 * kullanıcı hata görmesin.
 */
export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): AnalyticsFilters {
  const rawRange = first(searchParams["range"]);
  const range: DateRangePreset =
    rawRange === "24h" || rawRange === "7d" || rawRange === "30d" || rawRange === "90d"
      ? rawRange
      : "7d";

  const to = new Date();
  const from = new Date(to.getTime() - PRESET_MS[range]);

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    ...(first(searchParams["siteId"]) ? { siteId: first(searchParams["siteId"]) } : {}),
    ...(first(searchParams["deviceId"]) ? { deviceId: first(searchParams["deviceId"]) } : {}),
  };
}

/** API'ye gönderilecek sorgu parçası. */
export function toApiQuery(filters: AnalyticsFilters): Record<string, string | undefined> {
  return {
    from: filters.from,
    to: filters.to,
    siteId: filters.siteId,
    deviceId: filters.deviceId,
  };
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
