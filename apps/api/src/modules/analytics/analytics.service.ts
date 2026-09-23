import type { RollupFilters, RollupRepository } from "../../repositories/rollup.repository.js";
import type { ViewerSessionRepository } from "../../repositories/viewerSession.repository.js";
import type { DeviceRepository } from "../../repositories/device.repository.js";
import type { TenantRepository } from "../../repositories/tenant.repository.js";
import { currentTenantId } from "../../infra/tenantContext.js";
import type { AnalyticsFilterDto } from "./analytics.dto.js";
import {
  aggregateToDays,
  fillGaps,
  resolveGranularity,
  type Granularity,
} from "./granularity.strategy.js";

export type OverviewKpis = {
  sessions: number;
  /** Ekran önünden geçen — reklamcılıkta "gösterim". */
  impressions: number;
  /** Ekrana bakan — gerçek izleyici. */
  viewers: number;
  /** viewers / impressions. Quividi'nin "attention rate"i. */
  attentionRate: number;
  totalDwellSeconds: number;
  avgDwellSeconds: number;
  avgAge: number | null;
};

export type OverviewResponse = {
  current: OverviewKpis;
  /** Aynı uzunluktaki bir önceki dönem — yüzde değişim için. */
  previous: OverviewKpis;
  deltaPercent: Record<keyof OverviewKpis, number | null>;
};

export class AnalyticsService {
  constructor(
    private readonly rollups: RollupRepository,
    private readonly sessions: ViewerSessionRepository,
    private readonly devices: DeviceRepository,
    private readonly tenants: TenantRepository,
  ) {}

  /**
   * KPI kartları + önceki döneme göre değişim.
   *
   * Önceki dönem, seçilen aralıkla AYNI uzunlukta ve hemen öncesinde. "Geçen ay"
   * gibi takvim tabanlı bir karşılaştırma, 28 ve 31 günlük ayları
   * karşılaştırdığında yanıltıcı olurdu.
   */
  async overview(filter: AnalyticsFilterDto): Promise<OverviewResponse> {
    const rangeMs = filter.to.getTime() - filter.from.getTime();
    const previousFilter = {
      ...this.toRollupFilters(filter),
      from: new Date(filter.from.getTime() - rangeMs),
      to: new Date(filter.from.getTime() - 1),
    };

    const [current, previous] = await Promise.all([
      this.rollups.totals(this.toRollupFilters(filter)),
      this.rollups.totals(previousFilter),
    ]);

    const currentKpis = toKpis(current);
    const previousKpis = toKpis(previous);

    return {
      current: currentKpis,
      previous: previousKpis,
      deltaPercent: {
        sessions: percentChange(previousKpis.sessions, currentKpis.sessions),
        impressions: percentChange(previousKpis.impressions, currentKpis.impressions),
        viewers: percentChange(previousKpis.viewers, currentKpis.viewers),
        attentionRate: percentChange(previousKpis.attentionRate, currentKpis.attentionRate),
        totalDwellSeconds: percentChange(
          previousKpis.totalDwellSeconds,
          currentKpis.totalDwellSeconds,
        ),
        avgDwellSeconds: percentChange(
          previousKpis.avgDwellSeconds,
          currentKpis.avgDwellSeconds,
        ),
        avgAge: percentChange(previousKpis.avgAge ?? 0, currentKpis.avgAge ?? 0),
      },
    };
  }

  async timeseries(filter: AnalyticsFilterDto): Promise<{
    granularity: Granularity;
    points: Array<{
      bucketStart: string;
      sessions: number;
      passed: number;
      looked: number;
      lookingSeconds: number;
      avgDwellSeconds: number;
      avgAge: number | null;
    }>;
  }> {
    const granularity = resolveGranularity(filter.granularity, filter.from, filter.to);
    const timeZone = await this.timeZoneFor(filter);

    const hourly = await this.rollups.timeseriesHourly(this.toRollupFilters(filter));
    const shaped =
      granularity === "day" ? aggregateToDays(hourly, timeZone) : hourly;
    const points = fillGaps(shaped, filter.from, filter.to, granularity);

    return {
      granularity,
      points: points.map((point) => ({
        bucketStart: point.bucketStart.toISOString(),
        sessions: point.sessions,
        passed: point.passed,
        looked: point.looked,
        lookingSeconds: round1(point.lookingSeconds),
        avgDwellSeconds: point.looked > 0 ? round1(point.lookingSeconds / point.looked) : 0,
        avgAge: point.ageCount > 0 ? round1(point.ageSum / point.ageCount) : null,
      })),
    };
  }

  async breakdown(
    filter: AnalyticsFilterDto,
    dimension: "gender" | "ageBucket" | "emotion",
  ) {
    const filters = this.toRollupFilters(filter);

    // Duygu kırılımı saatlik tabloda kolon olarak duruyor; cinsiyet ve yaş ise
    // günlük demografi tablosunda satır olarak. İkisi farklı kaynaktan gelir.
    const rows =
      dimension === "emotion"
        ? Object.entries(await this.rollups.emotionTotals(filters)).map(([key, sessions]) => ({
            key,
            sessions,
            looked: sessions,
            lookingSeconds: 0,
          }))
        : await this.rollups.demographicBreakdown(filters, dimension);

    const total = rows.reduce((sum, row) => sum + row.sessions, 0);

    return {
      dimension,
      items: rows
        .map((row) => ({
          ...row,
          lookingSeconds: round1(row.lookingSeconds),
          share: total > 0 ? round1((row.sessions / total) * 100) : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions),
    };
  }

  /** Cihaz sıralaması — hangi ekran gerçekten izleniyor? */
  async deviceLeaderboard(filter: AnalyticsFilterDto) {
    const rows = await this.rollups.perDevice(this.toRollupFilters(filter));
    if (rows.length === 0) return { items: [] };

    // Cihaz adları ayrı çekiliyor: rollup tablosu isim taşımıyor (taşısaydı
    // cihaz yeniden adlandırıldığında geçmiş veri tutarsız olurdu).
    const devices = await this.devices.list(
      { page: 1, pageSize: 200 },
      {},
    );
    const nameById = new Map(devices.items.map((device) => [device.id, device]));

    return {
      items: rows.map((row) => {
        const device = nameById.get(row.deviceId);
        return {
          deviceId: row.deviceId,
          name: device?.name ?? `#${row.deviceId}`,
          code: device?.code ?? null,
          siteName: device?.site?.name ?? null,
          sessions: row.sessions,
          impressions: row.passed,
          viewers: row.looked,
          attentionRate: row.passed > 0 ? round1((row.looked / row.passed) * 100) : 0,
          lookingSeconds: round1(row.lookingSeconds),
        };
      }),
    };
  }

  /**
   * 7×24 ısı haritası — hangi gün ve saatte kalabalık?
   *
   * Saatlik rollup'tan hesaplanıyor; tenant'ın zaman diliminde "Pazartesi 14:00"
   * müşterinin kastettiği saattir.
   */
  async heatmap(filter: AnalyticsFilterDto) {
    const timeZone = await this.timeZoneFor(filter);
    const hourly = await this.rollups.timeseriesHourly(this.toRollupFilters(filter));

    // grid[weekday][hour] — weekday 0 = Pazartesi (TR okuma alışkanlığı).
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      hour12: false,
    });

    const weekdayIndex: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    };

    for (const point of hourly) {
      const parts = Object.fromEntries(
        formatter.formatToParts(point.bucketStart).map((part) => [part.type, part.value]),
      );
      const day = weekdayIndex[parts["weekday"] ?? ""] ?? 0;
      const hour = Number(parts["hour"] ?? 0) % 24;
      grid[day]![hour]! += point.looked;
    }

    return { timeZone, grid };
  }

  /**
   * Dikkat hunisi: geçen -> bakan -> eşiği aşan.
   *
   * Quividi'nin asıl değer önerisi bu üçlü: "kaç kişi gördü" değil, "kaç kişi
   * gerçekten izledi".
   */
  async funnel(filter: AnalyticsFilterDto, attentionThresholdSec: number) {
    const filters = this.toRollupFilters(filter);
    const totals = await this.rollups.totals(filters);

    const engaged = await this.sessions.count({
      from: filter.from,
      to: filter.to,
      ...(filters.siteIds ? { siteIds: filters.siteIds } : {}),
      ...(filters.deviceIds ? { deviceIds: filters.deviceIds } : {}),
      minDurationSec: Math.ceil(attentionThresholdSec),
    });

    return {
      attentionThresholdSec,
      steps: [
        { key: "passed", label: "Ekran önünden geçti", value: totals.passed },
        { key: "looked", label: "Ekrana baktı", value: totals.looked },
        {
          key: "engaged",
          label: `${attentionThresholdSec} sn+ izledi`,
          value: engaged,
        },
      ],
    };
  }

  private toRollupFilters(filter: AnalyticsFilterDto): RollupFilters {
    return {
      from: filter.from,
      to: filter.to,
      ...(filter.siteId?.length ? { siteIds: filter.siteId } : {}),
      ...(filter.deviceId?.length ? { deviceIds: filter.deviceId } : {}),
    };
  }

  private async timeZoneFor(filter: AnalyticsFilterDto): Promise<string> {
    if (filter.tz) return filter.tz;

    const tenantId = currentTenantId();
    if (tenantId === undefined) return "Europe/Istanbul";

    return (await this.tenants.findTimezone(tenantId)) ?? "Europe/Istanbul";
  }
}

function toKpis(totals: {
  sessions: number;
  passed: number;
  looked: number;
  lookingSeconds: number;
  ageSum: number;
  ageCount: number;
}): OverviewKpis {
  return {
    sessions: totals.sessions,
    impressions: totals.passed,
    viewers: totals.looked,
    attentionRate: totals.passed > 0 ? round1((totals.looked / totals.passed) * 100) : 0,
    totalDwellSeconds: round1(totals.lookingSeconds),
    avgDwellSeconds: totals.looked > 0 ? round1(totals.lookingSeconds / totals.looked) : 0,
    avgAge: totals.ageCount > 0 ? round1(totals.ageSum / totals.ageCount) : null,
  };
}

/**
 * Önceki dönem sıfırsa yüzde değişim TANIMSIZ'dır.
 * 0'dan 50'ye çıkışı "%∞ artış" ya da "%0" diye göstermek yerine null dönüp
 * panelin "yeni" yazmasına izin veriyoruz.
 */
function percentChange(previous: number, current: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round1(((current - previous) / previous) * 100);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
