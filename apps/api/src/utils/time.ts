/**
 * Zaman yardımcıları.
 *
 * Kural: veritabanındaki her şey UTC'dir. Yerel saate çevirme yalnızca iki
 * yerde olur — günlük agregasyonların hangi güne düşeceğini belirlerken
 * (tenant'ın timezone'u) ve panelde gösterirken.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Verilen anın ait olduğu UTC saatinin başlangıcı. Rollup kovalarının anahtarı. */
export function floorToUtcHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

/** [from, to] aralığındaki tüm UTC saat kovaları. */
export function utcHourRange(from: Date, to: Date): Date[] {
  const start = floorToUtcHour(from).getTime();
  const end = floorToUtcHour(to).getTime();

  const buckets: Date[] = [];
  for (let time = start; time <= end; time += HOUR_MS) {
    buckets.push(new Date(time));
  }
  return buckets;
}

/**
 * Bir anın, verilen zaman diliminde hangi YEREL güne düştüğünü bulur ve o günün
 * yerel gece yarısını UTC olarak döner.
 *
 * Intl kullanılıyor çünkü yaz saati geçişlerini elle hesaplamak (Türkiye artık
 * uygulamıyor ama başka müşteriler uygulayabilir) kaçınılmaz olarak hatalı olur.
 */
export function localDayStartUtc(date: Date, timeZone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  // Yerel duvar saatini UTC'ymiş gibi kurup gerçek UTC'den farkı çıkarıyoruz:
  // böylece o anki UTC ofsetini (yaz saati dahil) doğru buluyoruz.
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"] === "24" ? "0" : parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );

  const offsetMs = asUtc - date.getTime();
  const localMidnightAsUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
  );

  return new Date(localMidnightAsUtc - offsetMs);
}
