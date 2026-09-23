/**
 * Ortama göre değişmeyen, koda gömülü sabitler.
 * Ortama göre DEĞİŞEN her şey config/env.ts içindedir.
 */

/** Cihaz kimliğinin taşındığı başlık. Authorization: Bearer DEĞİL — ingest'in
 *  kullanıcı auth'undan loglarda ve proxy'lerde ayrışması için. */
export const API_KEY_HEADER = "x-api-key";

/** SUPER_ADMIN'in hangi tenant adına çalıştığını belirttiği başlık. */
export const TENANT_HEADER = "x-tenant-id";

/** Oturum çerezleri. */
export const ACCESS_COOKIE = "va_at";
export const REFRESH_COOKIE = "va_rt";

/** Cihaz API key formatı: vak_<12 karakter prefix>_<base64url secret> */
export const API_KEY_SCHEME = "vak";
export const API_KEY_PREFIX_LENGTH = 12;
export const API_KEY_SECRET_BYTES = 32;

/** Rotasyonda eski key'in kabul edilmeye devam ettiği süre. */
export const API_KEY_ROTATION_GRACE_DAYS = 7;

/** Bir cihazın aynı anda tutabileceği ACTIVE key sayısı (rotasyon için 2). */
export const API_KEY_MAX_ACTIVE_PER_DEVICE = 2;

/** lastUsedAt yazımı bu aralıkta en fazla bir kez yapılır; auth bir okuma
 *  işlemi olarak kalsın diye. */
export const API_KEY_LAST_USED_DEBOUNCE_MS = 60_000;

/** Ingest gövde limiti. Aşımda 413 döner ve cihaz batch'ini yarıya indirir. */
export const INGEST_BODY_LIMIT = "1mb";

/** Panel istekleri için gövde limiti — ingest'ten çok daha küçük. */
export const API_BODY_LIMIT = "100kb";

/** Cihaz bu süredir görülmediyse panelde "offline" sayılır. */
export const DEVICE_OFFLINE_AFTER_MS = 10 * 60_000;

/** Sayfalama. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** CSV export'un sert tavanı — bir isteğin tüm tabloyu çekmesini engeller. */
export const MAX_CSV_ROWS = 100_000;

/** Yaş kovası sınırları. Kiosk'ta da benzer bir liste var ama otorite BURASI:
 *  sunucu ham sayısal yaşı sakladığı için sınır değişse bile geçmiş veri
 *  yeniden kovalanabilir. */
export const AGE_BUCKET_BOUNDARIES = [12, 25, 45, 60] as const;
