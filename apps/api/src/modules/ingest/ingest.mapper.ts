import { AGE_BUCKET_BOUNDARIES } from "../../config/constants.js";
import { AgeBucket, Emotion, Gender } from "../../generated/prisma/enums.js";
import type { IngestSessionDto } from "./ingest.dto.js";

/**
 * ADAPTER — dış dünyanın etiketlerini domain'in enum'larına çevirir.
 *
 * Kiosk, DeepFace'in ham çıktısını ("Man", "happy") ve Türkçe yaş kovalarını
 * ("Yetişkin") gönderiyor. Bunlar sınırın DIŞINDA kalır: veritabanına, servis
 * katmanına ve panele asla girmezler. Yarın modeli değiştirip "male" göndermeye
 * başlarsak değişecek tek dosya burasıdır.
 */

const GENDER_MAP: Record<string, Gender> = {
  man: Gender.MALE,
  male: Gender.MALE,
  erkek: Gender.MALE,
  woman: Gender.FEMALE,
  female: Gender.FEMALE,
  kadin: Gender.FEMALE,
  // DeepFace analizi başarısız olduğunda kiosk bunu gönderiyor.
  bilinmiyor: Gender.UNKNOWN,
};

const EMOTION_MAP: Record<string, Emotion> = {
  angry: Emotion.ANGRY,
  disgust: Emotion.DISGUST,
  fear: Emotion.FEAR,
  happy: Emotion.HAPPY,
  sad: Emotion.SAD,
  surprise: Emotion.SURPRISE,
  neutral: Emotion.NEUTRAL,
  bilinmiyor: Emotion.UNKNOWN,
};

/** Kiosk'un Türkçe kova adları — yalnızca ageEstimate yoksa kullanılır. */
const AGE_BUCKET_MAP: Record<string, AgeBucket> = {
  cocuk: AgeBucket.CHILD,
  genc: AgeBucket.YOUTH,
  yetiskin: AgeBucket.ADULT,
  "orta yasli": AgeBucket.MIDDLE_AGED,
  yasli: AgeBucket.SENIOR,
};

/** Türkçe karakterleri ve büyük/küçük harf farkını eşleştirme dışı bırakır. */
function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ");
}

export function mapGender(raw: string | null | undefined): Gender {
  if (!raw) return Gender.UNKNOWN;
  return GENDER_MAP[normalizeLabel(raw)] ?? Gender.UNKNOWN;
}

export function mapEmotion(raw: string | null | undefined): Emotion {
  if (!raw) return Emotion.UNKNOWN;
  return EMOTION_MAP[normalizeLabel(raw)] ?? Emotion.UNKNOWN;
}

/**
 * Yaş kovası SUNUCUDA türetilir.
 *
 * Kiosk kendi kovasını da gönderiyor ama ona güvenmiyoruz: cihazdaki sınır
 * ayarı değiştirilirse veritabanı sessizce tutarsız hâle gelirdi. Sayısal
 * değer varsa otorite odur; kova adı yalnızca sayısal değeri olmayan eski
 * sürümler için bir yedektir.
 */
export function deriveAgeBucket(
  ageEstimate: number | null | undefined,
  ageBucketRaw: string | null | undefined,
): AgeBucket {
  if (typeof ageEstimate === "number") {
    const [child, youth, adult, middleAged] = AGE_BUCKET_BOUNDARIES;
    if (ageEstimate < child) return AgeBucket.CHILD;
    if (ageEstimate < youth) return AgeBucket.YOUTH;
    if (ageEstimate < adult) return AgeBucket.ADULT;
    if (ageEstimate < middleAged) return AgeBucket.MIDDLE_AGED;
    return AgeBucket.SENIOR;
  }

  if (ageBucketRaw) {
    return AGE_BUCKET_MAP[normalizeLabel(ageBucketRaw)] ?? AgeBucket.UNKNOWN;
  }

  return AgeBucket.UNKNOWN;
}

export type ViewerSessionInput = {
  sessionUuid: string;
  tenantId: number;
  siteId: number;
  deviceId: number;
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  personsPassed: number;
  personsLooked: number;
  lookingSeconds: number;
  ageEstimate: number | null;
  ageBucket: AgeBucket;
  gender: Gender;
  emotion: Emotion;
  appVersion: string | null;
};

export function toViewerSession(
  dto: IngestSessionDto,
  context: {
    tenantId: number;
    siteId: number;
    deviceId: number;
    appVersion: string | null;
  },
): ViewerSessionInput {
  return {
    sessionUuid: dto.sessionUuid,
    tenantId: context.tenantId,
    siteId: context.siteId,
    deviceId: context.deviceId,
    startedAt: dto.startedAt,
    endedAt: dto.endedAt,
    durationSec: dto.durationSec,
    personsPassed: dto.personsPassed,
    personsLooked: dto.personsLooked,
    lookingSeconds: dto.lookingSeconds,
    ageEstimate: dto.ageEstimate ?? null,
    ageBucket: deriveAgeBucket(dto.ageEstimate, dto.ageBucketRaw),
    gender: mapGender(dto.gender),
    emotion: mapEmotion(dto.emotion),
    appVersion: context.appVersion,
  };
}
