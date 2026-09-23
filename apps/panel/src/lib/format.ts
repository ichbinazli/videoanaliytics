import type { AgeBucket, Emotion, Gender, Role } from "@/types/api";

/**
 * Gösterim katmanı.
 *
 * Enum'ların Türkçe karşılıkları SADECE burada yaşar — veritabanında ve API'de
 * dil-nötr enum'lar var. Yarın İngilizce arayüz istenirse değişecek tek dosya
 * burasıdır.
 */

const numberFormatter = new Intl.NumberFormat("tr-TR");
const decimalFormatter = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

export function formatPercent(value: number): string {
  return `%${decimalFormatter.format(value)}`;
}

/** Saniyeyi insan okur süreye çevirir: 4215 -> "1 sa 10 dk". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${decimalFormatter.format(seconds)} sn`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk ${Math.round(seconds % 60)} sn`;

  const hours = Math.floor(minutes / 60);
  return `${formatNumber(hours)} sa ${minutes % 60} dk`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(iso));
}

/** Grafik ekseni için kısa etiket; granülerliğe göre saat ya da gün. */
export function formatBucketLabel(iso: string, granularity: "hour" | "day"): string {
  const date = new Date(iso);

  return granularity === "hour"
    ? new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(date);
}

/** "3 dakika önce" gibi göreli zaman — cihaz sağlığında okunması en kolay biçim. */
export function formatRelative(iso: string | null): string {
  if (!iso) return "hiç";

  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;

  return `${Math.round(hours / 24)} gün önce`;
}

const GENDER_LABELS: Record<Gender, string> = {
  MALE: "Erkek",
  FEMALE: "Kadın",
  UNKNOWN: "Bilinmiyor",
};

const AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  CHILD: "Çocuk",
  YOUTH: "Genç",
  ADULT: "Yetişkin",
  MIDDLE_AGED: "Orta yaşlı",
  SENIOR: "Yaşlı",
  UNKNOWN: "Bilinmiyor",
};

const EMOTION_LABELS: Record<Emotion, string> = {
  ANGRY: "Kızgın",
  DISGUST: "Tiksinti",
  FEAR: "Korku",
  HAPPY: "Mutlu",
  SAD: "Üzgün",
  SURPRISE: "Şaşkın",
  NEUTRAL: "Nötr",
  UNKNOWN: "Bilinmiyor",
};

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Platform yöneticisi",
  TENANT_ADMIN: "Yönetici",
  TENANT_VIEWER: "İzleyici",
};

export function labelFor(dimension: string, key: string): string {
  if (dimension === "gender") return GENDER_LABELS[key as Gender] ?? key;
  if (dimension === "ageBucket") return AGE_BUCKET_LABELS[key as AgeBucket] ?? key;
  if (dimension === "emotion") return EMOTION_LABELS[key as Emotion] ?? key;
  return key;
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Değişim yüzdesi. null "önceki dönem sıfırdı" demek — "%∞ artış" yazmak
 * yerine kullanıcıya "yeni" diyoruz.
 */
export function formatDelta(delta: number | null): { text: string; tone: "up" | "down" | "flat" } {
  if (delta === null) return { text: "yeni", tone: "flat" };
  if (delta === 0) return { text: "değişim yok", tone: "flat" };

  return {
    text: `${delta > 0 ? "+" : ""}${decimalFormatter.format(delta)}%`,
    tone: delta > 0 ? "up" : "down",
  };
}
