"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState } from "@/components/ui/Card";
import { KpiTile } from "@/components/charts/KpiTile";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import type { DeviceLeaderboardRow, OverviewResponse } from "@/types/api";

const REFRESH_MS = 10_000;
const WINDOW_MS = 15 * 60 * 1000;

type LiveData = {
  overview: OverviewResponse;
  devices: { items: DeviceLeaderboardRow[] };
};

/**
 * Tarayıcıdan `/backend/api/v1/...` çağrılıyor.
 *
 * Bu adres Next tarafından Express'e yönlendiriliyor; aynı origin olduğu için
 * httpOnly oturum çerezi isteğe kendiliğinden ekleniyor — ne CORS ne de token
 * taşıma kodu gerekiyor.
 */
async function fetchLive(): Promise<LiveData> {
  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_MS);
  const query = `?from=${from.toISOString()}&to=${to.toISOString()}`;

  const [overviewResponse, devicesResponse] = await Promise.all([
    fetch(`/backend/api/v1/analytics/overview${query}`, { cache: "no-store" }),
    fetch(`/backend/api/v1/analytics/devices${query}`, { cache: "no-store" }),
  ]);

  if (overviewResponse.status === 401 || devicesResponse.status === 401) {
    window.location.href = "/login";
    throw new Error("oturum sona erdi");
  }

  if (!overviewResponse.ok || !devicesResponse.ok) {
    throw new Error("Canlı veri alınamadı");
  }

  return {
    overview: (await overviewResponse.json()) as OverviewResponse,
    devices: (await devicesResponse.json()) as { items: DeviceLeaderboardRow[] },
  };
}

export function LiveBoard() {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await fetchLive());
      setUpdatedAt(new Date());
      setError(null);
    } catch (cause) {
      // Geçici bir ağ hatası ekranı boşaltmamalı: son bilinen veri kalır,
      // üstüne uyarı düşer.
      setError(cause instanceof Error ? cause.message : "Bilinmeyen hata");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!data) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-muted">
          {error ?? "Yükleniyor…"}
        </p>
      </Card>
    );
  }

  const kpis = data.overview.current;

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          Güncelleme başarısız: {error}. Aşağıdaki veriler son başarılı okumaya ait.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Gösterim" value={formatNumber(kpis.impressions)} />
        <KpiTile label="İzleyici" value={formatNumber(kpis.viewers)} />
        <KpiTile label="Dikkat oranı" value={formatPercent(kpis.attentionRate)} />
        <KpiTile
          label="Ort. izleme"
          value={`${formatDecimal(kpis.avgDwellSeconds)} sn`}
        />
      </div>

      <Card
        title="Cihazlar"
        subtitle={
          updatedAt
            ? `Son güncelleme ${updatedAt.toLocaleTimeString("tr-TR")}`
            : undefined
        }
      >
        {data.devices.items.length === 0 ? (
          <EmptyState
            title="Son 15 dakikada hareket yok"
            hint="Cihazlar veri gönderdikçe burada anlık olarak görünecekler."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.devices.items.map((device) => (
              <div key={device.deviceId} className="rounded-xl border border-line p-4">
                <p className="truncate text-sm font-semibold">{device.name}</p>
                <p className="truncate text-xs text-muted">{device.siteName ?? "—"}</p>

                <div className="mt-3 flex items-baseline gap-4">
                  <div>
                    <p className="text-lg font-bold tabular-nums">
                      {formatNumber(device.viewers)}
                    </p>
                    <p className="text-[11px] text-muted">izleyici</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums">
                      {formatPercent(device.attentionRate)}
                    </p>
                    <p className="text-[11px] text-muted">dikkat</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
