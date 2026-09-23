import { formatNumber } from "@/lib/format";
import type { HeatmapResponse } from "@/types/api";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/**
 * 7×24 yoğunluk ızgarası — hangi gün ve saatte kalabalık?
 *
 * Chart kütüphanesi yok: düz CSS grid. Sunucuda render ediliyor ve tarayıcıya
 * hiç JavaScript göndermiyor.
 */
export function HeatmapGrid({ heatmap }: { heatmap: HeatmapResponse }) {
  const max = Math.max(1, ...heatmap.grid.flat());

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="mb-1 flex gap-[3px] pl-9">
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="flex-1 text-center text-[9px] text-muted">
              {hour % 3 === 0 ? hour : ""}
            </div>
          ))}
        </div>

        {heatmap.grid.map((row, dayIndex) => (
          <div key={dayIndex} className="mb-[3px] flex items-center gap-[3px]">
            <div className="w-9 shrink-0 text-[10px] font-medium text-muted">
              {WEEKDAYS[dayIndex]}
            </div>
            {row.map((value, hour) => {
              // Karekök ölçek: doğrusal ölçekte tek bir yoğun saat diğer
              // hepsini görünmez kılıyor.
              const intensity = value === 0 ? 0 : Math.sqrt(value / max);

              return (
                <div
                  key={hour}
                  title={`${WEEKDAYS[dayIndex]} ${String(hour).padStart(2, "0")}:00 — ${formatNumber(value)} izleyici`}
                  className="h-5 flex-1 rounded-[3px]"
                  style={{
                    background:
                      intensity === 0
                        ? "var(--color-chip)"
                        : `color-mix(in srgb, var(--color-series-2) ${Math.round(intensity * 100)}%, var(--color-chip))`,
                  }}
                />
              );
            })}
          </div>
        ))}

        <p className="mt-2 text-[10px] text-muted">
          Saatler {heatmap.timeZone} saat dilimine göre.
        </p>
      </div>
    </div>
  );
}
