import "dotenv/config";
import { z } from "zod";

/**
 * Ortam değişkenleri tek bir yerde, tek seferde doğrulanır.
 *
 * Amaç fail-fast: eksik ya da hatalı bir değişken uygulamayı AÇILIŞTA düşürür.
 * Aksi hâlde hata, ilgili kod yoluna ilk kez girildiğinde — çoğu zaman prod'da,
 * çoğu zaman gece — ortaya çıkar.
 *
 * Kodun geri kalanı process.env'e ASLA doğrudan dokunmaz; buradan import eder.
 */

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  DATABASE_URL: z.string().min(1),

  // Kullanıcı oturumu
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET en az 32 karakter olmalı"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: booleanish.default(false),

  // Cihaz API key'leri
  API_KEY_PEPPER: z
    .string()
    .min(32, "API_KEY_PEPPER en az 32 karakter olmalı"),

  // Panel origin'leri — hem CORS hem CSRF Origin allowlist'i için
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // Veri toplama
  INGEST_MAX_BATCH: z.coerce.number().int().positive().max(5000).default(500),
  INGEST_CLOCK_SKEW_FUTURE_HOURS: z.coerce.number().int().positive().default(48),
  INGEST_CLOCK_SKEW_PAST_DAYS: z.coerce.number().int().positive().default(90),
  INGEST_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),

  // Zamanlanmış işler
  ROLLUP_CRON: z.string().default("*/5 * * * *"),
  RAW_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  // Logger henüz kurulmamış olabilir; bu yüzden doğrudan stderr.
  process.stderr.write(
    `\nOrtam değişkenleri geçersiz:\n${issues}\n\n` +
      `apps/api/.env.example dosyasını .env olarak kopyalayıp doldurun.\n\n`,
  );
  process.exit(1);
}

export const env = Object.freeze(parsed.data);

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

if (isProduction && !env.COOKIE_SECURE) {
  process.stderr.write(
    "\nCOOKIE_SECURE=false ile production'da çalışılamaz: oturum çerezleri düz HTTP üzerinden gider.\n\n",
  );
  process.exit(1);
}

export type Env = typeof env;
