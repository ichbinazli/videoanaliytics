import { formatNumber, formatPercent } from "@/lib/format";
import type { FunnelResponse } from "@/types/api";

/**
 * Dikkat hunisi — geçen / bakan / gerçekten izleyen.
 *
 * Grafik kütüphanesi kullanılmadı: üç yatay çubuk için Recharts yüklemek,
 * 40 satırlık CSS'in yapabildiğini 40 KB JavaScript'e ödemek olurdu.
 * Ayrıca bu haliyle sunucuda render ediliyor.
 */
export function AttentionFunnel({ funnel }: { funnel: FunnelResponse }) {
  const top = funnel.steps[0]?.value ?? 0;

  return (
    <ol className="space-y-3">
      {funnel.steps.map((step, index) => {
        const widthPercent = top > 0 ? (step.value / top) * 100 : 0;
        const previous = funnel.steps[index - 1]?.value;
        const conversion =
          previous && previous > 0 ? (step.value / previous) * 100 : null;

        return (
          <li key={step.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-ink-soft">{step.label}</span>
              <span className="tabular-nums">
                <span className="font-bold">{formatNumber(step.value)}</span>
                {conversion !== null && (
                  <span className="ml-2 text-muted">
                    ({formatPercent(conversion)} dönüşüm)
                  </span>
                )}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-chip">
              <div
                className="h-full rounded-full bg-ink transition-[width]"
                style={{ width: `${Math.max(widthPercent, 1)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
