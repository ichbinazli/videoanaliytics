import { api, toQuery } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { Card, EmptyState } from "@/components/ui/Card";
import { FilterBar } from "@/components/layout/FilterBar";
import { KpiTile } from "@/components/charts/KpiTile";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { DonutBreakdown } from "@/components/charts/DonutBreakdown";
import { AttentionFunnel } from "@/components/charts/AttentionFunnel";
import { HeatmapGrid } from "@/components/charts/HeatmapGrid";
import { formatDecimal, formatDuration, formatNumber, formatPercent } from "@/lib/format";
import type {
  BreakdownResponse,
  Device,
  DeviceLeaderboardRow,
  FunnelResponse,
  HeatmapResponse,
  OverviewResponse,
  Paginated,
  Site,
  TimeseriesResponse,
} from "@/types/api";

export const metadata = { title: "Genel bakış — Video Analytics" };

export default async function OverviewPage(props: PageProps<"/">) {
  // Next 16: searchParams artık bir Promise.
  const searchParams = await props.searchParams;
  const filters = parseFilters(searchParams);
  const query = toQuery(toApiQuery(filters));

  // Tüm kartlar paralel çekiliyor: sıralı beklemek sayfayı kartların toplamı
  // kadar yavaşlatırdı.
  const [overview, timeseries, gender, age, emotion, devices, funnel, heatmap, siteList, deviceList] =
    await Promise.all([
      api<OverviewResponse>(`/analytics/overview${query}`),
      api<TimeseriesResponse>(`/analytics/timeseries${query}`),
      api<BreakdownResponse>(`/analytics/breakdown${query}&dimension=gender`),
      api<BreakdownResponse>(`/analytics/breakdown${query}&dimension=ageBucket`),
      api<BreakdownResponse>(`/analytics/breakdown${query}&dimension=emotion`),
      api<{ items: DeviceLeaderboardRow[] }>(`/analytics/devices${query}`),
      api<FunnelResponse>(`/analytics/funnel${query}`),
      api<HeatmapResponse>(`/analytics/heatmap${query}`),
      api<Paginated<Site>>("/sites?pageSize=200"),
      api<Paginated<Device>>("/devices?pageSize=200"),
    ]);

  const kpis = overview.current;
  const hasData = kpis.sessions > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Genel bakış</h1>
        <FilterBar sites={siteList.items} devices={deviceList.items} />
      </div>

      {!hasData ? (
        <EmptyState
          title="Bu aralıkta veri yok"
          hint="Cihazlar veri göndermeye başladığında metrikler burada görünecek. Cihaz kurulumu için Cihazlar sayfasından bir API key üretin."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiTile
              label="Gösterim"
              value={formatNumber(kpis.impressions)}
              delta={overview.deltaPercent.impressions}
              hint="ekran önünden geçen"
            />
            <KpiTile
              label="İzleyici"
              value={formatNumber(kpis.viewers)}
              delta={overview.deltaPercent.viewers}
              hint="ekrana bakan"
            />
            <KpiTile
              label="Dikkat oranı"
              value={formatPercent(kpis.attentionRate)}
              delta={overview.deltaPercent.attentionRate}
            />
            <KpiTile
              label="Ort. izleme süresi"
              value={formatDecimal(kpis.avgDwellSeconds) + " sn"}
              delta={overview.deltaPercent.avgDwellSeconds}
            />
            <KpiTile
              label="Ortalama yaş"
              value={kpis.avgAge === null ? "—" : formatDecimal(kpis.avgAge)}
              delta={overview.deltaPercent.avgAge}
              // Yaşın artması ne iyi ne kötü; yeşil/kırmızı yanıltıcı olurdu.
              neutralDelta
            />
          </div>

          <Card
            title="Zaman içindeki seyir"
            subtitle={`Toplam izleme süresi: ${formatDuration(kpis.totalDwellSeconds)}`}
          >
            <TimeseriesChart points={timeseries.points} granularity={timeseries.granularity} />
          </Card>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Cinsiyet">
              <DonutBreakdown items={gender.items} dimension="gender" />
            </Card>
            <Card title="Yaş grubu">
              <DonutBreakdown items={age.items} dimension="ageBucket" />
            </Card>
            <Card title="Duygu">
              <DonutBreakdown items={emotion.items} dimension="emotion" />
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Dikkat hunisi" subtitle="Geçen → bakan → gerçekten izleyen">
              <AttentionFunnel funnel={funnel} />
            </Card>

            <Card title="Yoğunluk haritası" subtitle="Gün ve saate göre izleyici">
              <HeatmapGrid heatmap={heatmap} />
            </Card>
          </div>

          <Card title="Cihaz performansı" subtitle="Dikkat oranına göre">
            {devices.items.length === 0 ? (
              <EmptyState title="Bu aralıkta cihaz verisi yok" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="pb-2 font-medium">Cihaz</th>
                      <th className="pb-2 font-medium">Mağaza</th>
                      <th className="pb-2 text-right font-medium">Gösterim</th>
                      <th className="pb-2 text-right font-medium">İzleyici</th>
                      <th className="pb-2 text-right font-medium">Dikkat</th>
                      <th className="pb-2 text-right font-medium">Süre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.items.map((row) => (
                      <tr key={row.deviceId} className="border-b border-line last:border-0">
                        <td className="py-2.5 font-medium">{row.name}</td>
                        <td className="py-2.5 text-muted">{row.siteName ?? "—"}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatNumber(row.impressions)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatNumber(row.viewers)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-semibold">
                          {formatPercent(row.attentionRate)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted">
                          {formatDuration(row.lookingSeconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
