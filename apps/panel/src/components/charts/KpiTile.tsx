import { formatDelta } from "@/lib/format";

/**
 * Tek bir KPI kutusu: değer + önceki döneme göre değişim.
 *
 * Değişim tonu bilinçli olarak "yüksek = iyi" varsaymıyor; `invertDelta` ile
 * çağıran taraf belirtiyor. Örneğin ortalama yaşın artması ne iyi ne kötüdür.
 */
export function KpiTile({
  label,
  value,
  delta,
  hint,
  neutralDelta = false,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  neutralDelta?: boolean;
}) {
  const change = delta === undefined ? null : formatDelta(delta);

  const toneClass =
    !change || neutralDelta || change.tone === "flat"
      ? "text-muted"
      : change.tone === "up"
        ? "text-[#0a7a3d]"
        : "text-danger";

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</p>

      <div className="mt-1 flex items-center gap-2">
        {change && (
          <span className={`text-xs font-semibold ${toneClass}`}>{change.text}</span>
        )}
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
    </div>
  );
}
