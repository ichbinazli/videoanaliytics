"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBucketLabel, formatNumber } from "@/lib/format";
import type { TimeseriesPoint } from "@/types/api";

/**
 * Gösterim ve izleyici sayısının zaman içindeki seyri.
 *
 * İki seri üst üste değil YAN YANA (stack yok): "kaç kişi geçti" ile "kaçı
 * baktı" birbirinin alt kümesi; üst üste yığmak toplamı iki katı gösterirdi.
 */
export function TimeseriesChart({
  points,
  granularity,
}: {
  points: TimeseriesPoint[];
  granularity: "hour" | "day";
}) {
  const data = points.map((point) => ({
    label: formatBucketLabel(point.bucketStart, granularity),
    gosterim: point.passed,
    izleyici: point.looked,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="fillGosterim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-series-1)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--color-series-1)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillIzleyici" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-series-2)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-series-2)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
          tickLine={false}
          axisLine={false}
          // Çok nokta olduğunda etiketler üst üste biner; Recharts'ın kendi
          // seyreltmesine bırakıyoruz.
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatNumber(value)}
          width={56}
        />
        <Tooltip
          // Recharts'ın formatter tipi değeri `ValueType | undefined` veriyor:
          // veri noktası eksik olabilir. Sayıya zorlamak yerine kontrol ediyoruz.
          formatter={(value, name) => [
            typeof value === "number" ? formatNumber(value) : "—",
            String(name),
          ]}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid var(--color-line)",
            fontSize: 12,
          }}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
        />

        <Area
          type="monotone"
          dataKey="gosterim"
          name="Gösterim"
          stroke="var(--color-series-1)"
          strokeWidth={2}
          fill="url(#fillGosterim)"
        />
        <Area
          type="monotone"
          dataKey="izleyici"
          name="İzleyici"
          stroke="var(--color-series-2)"
          strokeWidth={2}
          fill="url(#fillIzleyici)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
