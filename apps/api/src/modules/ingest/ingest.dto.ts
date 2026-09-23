import { z } from "zod";
import { env } from "../../config/env.js";

/**
 * Cihazların uyduğu wire kontratı.
 *
 * Bu dosya aynı zamanda YAYINLANAN sözleşmedir; docs/ingest-contract.md ile
 * birlikte güncellenir. Uyuşmazlık olursa otorite burasıdır.
 */

const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const sessionSchema = z.object({
  /** Cihaz üretir ve retry'lar boyunca değiştirmez — idempotency anahtarı. */
  sessionUuid: z.uuid(),

  startedAt: isoDateTime,
  endedAt: isoDateTime,

  durationSec: z.number().int().min(0).max(32_000),
  personsPassed: z.number().int().min(0).max(32_000).default(0),
  personsLooked: z.number().int().min(0).max(32_000).default(0),
  lookingSeconds: z.number().min(0).max(999_999).default(0),

  /** Sayısal tahmin; varsa yaş kovası bundan TÜRETİLİR. */
  ageEstimate: z.number().int().min(0).max(120).nullish(),
  /** Eski kiosk sürümleri için fallback — Türkçe kova adı. */
  ageBucketRaw: z.string().max(40).nullish(),

  /** Ham DeepFace etiketleri; mapper normalize eder. */
  gender: z.string().max(40).nullish(),
  emotion: z.string().max(40).nullish(),
});

export type IngestSessionDto = z.infer<typeof sessionSchema>;

export const sessionBatchSchema = z.object({
  schemaVersion: z.literal(1),
  sentAt: isoDateTime.optional(),
  device: z
    .object({
      appVersion: z.string().max(32).nullish(),
      spoolDepth: z.number().int().min(0).nullish(),
    })
    .optional(),
  sessions: z
    .array(sessionSchema)
    .min(1, "En az bir oturum gönderilmeli")
    // Limit burada da uygulanıyor: gövde boyutu limitine takılmayan ama çok
    // sayıda küçük kayıt içeren bir batch de reddedilmeli.
    .max(env.INGEST_MAX_BATCH, `Tek seferde en fazla ${env.INGEST_MAX_BATCH} oturum`),
});

export type SessionBatchDto = z.infer<typeof sessionBatchSchema>;

export const heartbeatSchema = z.object({
  appVersion: z.string().max(32).nullish(),
  spoolDepth: z.number().int().min(0).nullish(),
});

export type HeartbeatDto = z.infer<typeof heartbeatSchema>;

/** Bir oturumun neden kabul edilmediğini anlatan sabit kodlar. */
export const RejectReason = {
  TIMESTAMP_OUT_OF_WINDOW: "TIMESTAMP_OUT_OF_WINDOW",
  END_BEFORE_START: "END_BEFORE_START",
} as const;

export type RejectReason = (typeof RejectReason)[keyof typeof RejectReason];

export type IngestResult = {
  accepted: number;
  duplicates: number;
  rejected: Array<{ sessionUuid: string; reason: RejectReason }>;
  serverTime: string;
};
