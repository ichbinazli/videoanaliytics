import type { TimeseriesPoint } from "../../repositories/rollup.repository.js";

/**
 * STRATEGY — zaman serisinin hangi çözünürlükte döneceğini belirler.
 *
 * Gerçekten değişen bir algoritma olduğu için pattern burada hak ediyor:
 * saatlik kovalar 90 günlük bir aralıkta 2160 nokta üretir; hiçbir grafik bunu
 * anlamlı gösteremez ve JSON gereksiz büyür. Günlük toplama, saatlik satırların
 * üstünde yapılır — ayrı bir günlük tablo tutmaya gerek yok.
 */
export type Granularity = "hour" | "day";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `auto` seçildiğinde aralık genişliğine göre karar verir.
 *
 * Eşik 3 gün: 72 nokta bir grafikte hâlâ okunabilir, 7 günlük 168 nokta ise
 * gürültü olmaya başlıyor.
 */
export function resolveGranularity(
  requested: "hour" | "day" | "auto",
  from: Date,
  to: Date,
): Granularity {
  if (requested !== "auto") return requested;
  return to.getTime() - from.getTime() > 3 * DAY_MS ? "day" : "hour";
}

/**
 * Saatlik noktaları günlük kovalara toplar.
 *
 * `timeZone` verilirse günler o zaman dilimine göre kesilir — müşteri "Salı"
 * dediğinde kendi Salı'sını kastediyor, UTC'ninkini değil.
 */
export function aggregateToDays(
  points: TimeseriesPoint[],
  timeZone: string,
): TimeseriesPoint[] {
  const byDay = new Map<number, TimeseriesPoint>();

  for (const point of points) {
    const dayKey = startOfLocalDay(point.bucketStart, timeZone).getTime();
    const existing = byDay.get(dayKey);

    if (!existing) {
      byDay.set(dayKey, { ...point, bucketStart: new Date(dayKey) });
      continue;
    }

    existing.sessions += point.sessions;
    existing.passed += point.passed;
    existing.looked += point.looked;
    existing.lookingSeconds += point.lookingSeconds;
    existing.durationSecSum += point.durationSecSum;
    // Ortalama yaş için toplam ve adet ayrı taşınıyor: ortalamaların
    // ortalamasını almak yanlış sonuç verirdi.
    existing.ageSum += point.ageSum;
    existing.ageCount += point.ageCount;
  }

  return [...byDay.values()].sort(
    (a, b) => a.bucketStart.getTime() - b.bucketStart.getTime(),
  );
}

function startOfLocalDay(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(
    Date.UTC(Number(lookup["year"]), Number(lookup["month"]) - 1, Number(lookup["day"])),
  );
}

/**
 * Boş kovaları doldurur.
 *
 * Veri olmayan saatler sorgudan hiç dönmez; grafikte bu, çizginin kopması ya da
 * iki nokta arasının düz bir çizgiyle birleştirilmesi demek — ikisi de yanıltıcı.
 */
export function fillGaps(
  points: TimeseriesPoint[],
  from: Date,
  to: Date,
  granularity: Granularity,
): TimeseriesPoint[] {
  const stepMs = granularity === "hour" ? 60 * 60 * 1000 : DAY_MS;
  const existing = new Map(points.map((point) => [point.bucketStart.getTime(), point]));

  const filled: TimeseriesPoint[] = [];
  const start = Math.floor(from.getTime() / stepMs) * stepMs;

  for (let time = start; time <= to.getTime(); time += stepMs) {
    filled.push(
      existing.get(time) ?? {
        bucketStart: new Date(time),
        sessions: 0,
        passed: 0,
        looked: 0,
        lookingSeconds: 0,
        durationSecSum: 0,
        ageSum: 0,
        ageCount: 0,
      },
    );
  }

  return filled;
}
