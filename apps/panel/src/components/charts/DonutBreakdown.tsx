"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber, formatPercent, labelFor } from "@/lib/format";
import type { BreakdownItem } from "@/types/api";

const SERIES = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
];

/**
 * Kategorik kırılım.
 *
 * Efsane (legend) grafiğin YANINDA ve değerleriyle birlikte: pasta diliminden
 * yüzde okumak zordur, sayıyı yazmak dilim boyutunu tahmin ettirmekten iyidir.
 */
export function DonutBreakdown({
  items,
  dimension,
}: {
  items: BreakdownItem[];
  dimension: string;
}) {
  const data = items.map((item) => ({
    name: labelFor(dimension, item.key),
    value: item.sessions,
    share: item.share,
  }));

  return (
    <div className="flex items-center gap-4">
      <div className="h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={70}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={SERIES[index % SERIES.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => (typeof value === "number" ? formatNumber(value) : "—")}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--color-line)",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((entry, index) => (
          <li key={entry.name} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: SERIES[index % SERIES.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{entry.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatPercent(entry.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
