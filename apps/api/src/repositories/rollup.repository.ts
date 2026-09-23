import type { ExtendedPrismaClient } from "../infra/prisma.js";
import type { AgeBucket, Gender } from "../generated/prisma/enums.js";
import { runAsSystem } from "../infra/tenantContext.js";

export type HourlyBucketAggregate = {
  tenantId: number;
  siteId: number;
  deviceId: number;
  bucketStart: Date;
  sessionCount: number;
  personsPassed: number;
  personsLooked: number;
  lookingSeconds: number;
  durationSecSum: number;
  ageSum: number;
  ageCount: number;
  emAngry: number;
  emDisgust: number;
  emFear: number;
  emHappy: number;
  emSad: number;
  emSurprise: number;
  emNeutral: number;
  emUnknown: number;
};

export type DemographicBucketAggregate = {
  tenantId: number;
  siteId: number;
  deviceId: number;
  bucketStart: Date;
  gender: Gender;
  ageBucket: AgeBucket;
  sessionCount: number;
  personsLooked: number;
  lookingSeconds: number;
};

export type TimeseriesPoint = {
  bucketStart: Date;
  sessions: number;
  passed: number;
  looked: number;
  lookingSeconds: number;
  durationSecSum: number;
  ageSum: number;
  ageCount: number;
};

export type RollupFilters = {
  from: Date;
  to: Date;
  siteIds?: number[];
  deviceIds?: number[];
};

/**
 * Rollup tablolarının okunması ve yeniden hesaplanması.
 *
 * Hesaplama kısmı ham SQL kullanır — Prisma'nın groupBy'ı emotion sayımları gibi
 * koşullu toplamları (SUM(CASE WHEN ...)) ifade edemiyor ve tek sorgu yerine
 * yedi sorgu gerekirdi. Ham SQL yazan her yer gibi burada da tenant filtresini
 * ELLE eklemek zorundayız: guard extension'ı $queryRaw'ı görmez.
 */
export class RollupRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  private run<T>(fn: () => T): T {
    return runAsSystem("rollup: ham SQL, tenant filtresi elle uygulanıyor", fn);
  }

  /**
   * Bir saat kovasını HAM SATIRLARDAN yeniden hesaplar.
   *
   * "Yeniden hesapla", "artır" değil: bu yüzden job istenildiği kadar
   * çalıştırılabilir, sonuç hep aynıdır ve bir hatadan sonra geriye dönük
   * düzeltme yapılabilir.
   */
  async computeHourlyBucket(
    deviceId: number,
    bucketStart: Date,
  ): Promise<HourlyBucketAggregate | null> {
    const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);

    const rows = await this.run(
      () => this.prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          tenantId,
          MIN(siteId)                                        AS siteId,
          COUNT(*)                                           AS sessionCount,
          COALESCE(SUM(personsPassed), 0)                    AS personsPassed,
          COALESCE(SUM(personsLooked), 0)                    AS personsLooked,
          COALESCE(SUM(lookingSeconds), 0)                   AS lookingSeconds,
          COALESCE(SUM(durationSec), 0)                      AS durationSecSum,
          COALESCE(SUM(ageEstimate), 0)                      AS ageSum,
          SUM(CASE WHEN ageEstimate IS NOT NULL THEN 1 ELSE 0 END) AS ageCount,
          SUM(emotion = 'ANGRY')                             AS emAngry,
          SUM(emotion = 'DISGUST')                           AS emDisgust,
          SUM(emotion = 'FEAR')                              AS emFear,
          SUM(emotion = 'HAPPY')                             AS emHappy,
          SUM(emotion = 'SAD')                               AS emSad,
          SUM(emotion = 'SURPRISE')                          AS emSurprise,
          SUM(emotion = 'NEUTRAL')                           AS emNeutral,
          SUM(emotion = 'UNKNOWN')                           AS emUnknown
        FROM viewer_sessions
        WHERE deviceId = ${deviceId}
          AND startedAt >= ${bucketStart}
          AND startedAt <  ${bucketEnd}
        GROUP BY tenantId
      `,
    );

    const row = rows[0];
    // Kovada hiç satır kalmamış olabilir (retention sildi ya da veri düzeltildi).
    if (!row || Number(row["sessionCount"]) === 0) return null;

    return {
      tenantId: Number(row["tenantId"]),
      siteId: Number(row["siteId"]),
      deviceId,
      bucketStart,
      sessionCount: Number(row["sessionCount"]),
      personsPassed: Number(row["personsPassed"]),
      personsLooked: Number(row["personsLooked"]),
      lookingSeconds: Number(row["lookingSeconds"]),
      durationSecSum: Number(row["durationSecSum"]),
      ageSum: Number(row["ageSum"]),
      ageCount: Number(row["ageCount"]),
      emAngry: Number(row["emAngry"]),
      emDisgust: Number(row["emDisgust"]),
      emFear: Number(row["emFear"]),
      emHappy: Number(row["emHappy"]),
      emSad: Number(row["emSad"]),
      emSurprise: Number(row["emSurprise"]),
      emNeutral: Number(row["emNeutral"]),
      emUnknown: Number(row["emUnknown"]),
    };
  }

  upsertHourly(aggregate: HourlyBucketAggregate): Promise<unknown> {
    const { deviceId, bucketStart, ...values } = aggregate;

    return this.run(() =>
      this.prisma.sessionRollupHourly.upsert({
        where: { deviceId_bucketStart: { deviceId, bucketStart } },
        create: { deviceId, bucketStart, ...values },
        update: values,
      }),
    );
  }

  deleteHourly(deviceId: number, bucketStart: Date): Promise<unknown> {
    return this.run(() =>
      this.prisma.sessionRollupHourly.deleteMany({ where: { deviceId, bucketStart } }),
    );
  }

  /**
   * Günlük demografi kırılımı — cihaz ve YEREL gün bazında.
   *
   * bucketStart parametresi tenant'ın yerel gece yarısının UTC karşılığıdır;
   * hesaplamayı çağıran taraf yapar çünkü zaman dilimi tenant'a aittir.
   */
  async computeDemographicDay(
    deviceId: number,
    dayStartUtc: Date,
    dayEndUtc: Date,
  ): Promise<DemographicBucketAggregate[]> {
    const rows = await this.run(
      () => this.prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          tenantId,
          MIN(siteId)                      AS siteId,
          gender,
          ageBucket,
          COUNT(*)                         AS sessionCount,
          COALESCE(SUM(personsLooked), 0)  AS personsLooked,
          COALESCE(SUM(lookingSeconds), 0) AS lookingSeconds
        FROM viewer_sessions
        WHERE deviceId = ${deviceId}
          AND startedAt >= ${dayStartUtc}
          AND startedAt <  ${dayEndUtc}
        GROUP BY tenantId, gender, ageBucket
      `,
    );

    return rows.map((row) => ({
      tenantId: Number(row["tenantId"]),
      siteId: Number(row["siteId"]),
      deviceId,
      bucketStart: dayStartUtc,
      gender: row["gender"] as Gender,
      ageBucket: row["ageBucket"] as AgeBucket,
      sessionCount: Number(row["sessionCount"]),
      personsLooked: Number(row["personsLooked"]),
      lookingSeconds: Number(row["lookingSeconds"]),
    }));
  }

  async replaceDemographicDay(
    deviceId: number,
    dayStartUtc: Date,
    aggregates: DemographicBucketAggregate[],
  ): Promise<void> {
    await this.run(async () => {
      // Önce sil sonra yaz: bir kırılım (ör. tek bir FEMALE/SENIOR kaydı)
      // düzeltme sonrası ortadan kalkmışsa eski satır kalmasın.
      await this.prisma.demographicRollupDaily.deleteMany({
        where: { deviceId, bucketStart: dayStartUtc },
      });

      if (aggregates.length > 0) {
        await this.prisma.demographicRollupDaily.createMany({ data: aggregates });
      }
    });
  }

  // --- Panel okumaları ----------------------------------------------------
  // Bunlar guard extension'ının KAPSAMINDA: normal Prisma sorguları oldukları
  // için tenantId otomatik ekleniyor.

  async timeseriesHourly(filters: RollupFilters): Promise<TimeseriesPoint[]> {
    const rows = await this.prisma.sessionRollupHourly.groupBy({
      by: ["bucketStart"],
      where: this.buildWhere(filters),
      _sum: {
        sessionCount: true,
        personsPassed: true,
        personsLooked: true,
        lookingSeconds: true,
        durationSecSum: true,
        ageSum: true,
        ageCount: true,
      },
      orderBy: { bucketStart: "asc" },
    });

    return rows.map((row) => ({
      bucketStart: row.bucketStart,
      sessions: row._sum.sessionCount ?? 0,
      passed: row._sum.personsPassed ?? 0,
      looked: row._sum.personsLooked ?? 0,
      lookingSeconds: Number(row._sum.lookingSeconds ?? 0),
      durationSecSum: row._sum.durationSecSum ?? 0,
      ageSum: row._sum.ageSum ?? 0,
      ageCount: row._sum.ageCount ?? 0,
    }));
  }

  async totals(filters: RollupFilters): Promise<TimeseriesPoint> {
    const result = await this.prisma.sessionRollupHourly.aggregate({
      where: this.buildWhere(filters),
      _sum: {
        sessionCount: true,
        personsPassed: true,
        personsLooked: true,
        lookingSeconds: true,
        durationSecSum: true,
        ageSum: true,
        ageCount: true,
      },
    });

    return {
      bucketStart: filters.from,
      sessions: result._sum.sessionCount ?? 0,
      passed: result._sum.personsPassed ?? 0,
      looked: result._sum.personsLooked ?? 0,
      lookingSeconds: Number(result._sum.lookingSeconds ?? 0),
      durationSecSum: result._sum.durationSecSum ?? 0,
      ageSum: result._sum.ageSum ?? 0,
      ageCount: result._sum.ageCount ?? 0,
    };
  }

  async emotionTotals(filters: RollupFilters) {
    const result = await this.prisma.sessionRollupHourly.aggregate({
      where: this.buildWhere(filters),
      _sum: {
        emAngry: true,
        emDisgust: true,
        emFear: true,
        emHappy: true,
        emSad: true,
        emSurprise: true,
        emNeutral: true,
        emUnknown: true,
      },
    });

    return {
      ANGRY: result._sum.emAngry ?? 0,
      DISGUST: result._sum.emDisgust ?? 0,
      FEAR: result._sum.emFear ?? 0,
      HAPPY: result._sum.emHappy ?? 0,
      SAD: result._sum.emSad ?? 0,
      SURPRISE: result._sum.emSurprise ?? 0,
      NEUTRAL: result._sum.emNeutral ?? 0,
      UNKNOWN: result._sum.emUnknown ?? 0,
    };
  }

  async perDevice(filters: RollupFilters) {
    const rows = await this.prisma.sessionRollupHourly.groupBy({
      by: ["deviceId"],
      where: this.buildWhere(filters),
      _sum: {
        sessionCount: true,
        personsPassed: true,
        personsLooked: true,
        lookingSeconds: true,
      },
      orderBy: { _sum: { personsLooked: "desc" } },
    });

    return rows.map((row) => ({
      deviceId: row.deviceId,
      sessions: row._sum.sessionCount ?? 0,
      passed: row._sum.personsPassed ?? 0,
      looked: row._sum.personsLooked ?? 0,
      lookingSeconds: Number(row._sum.lookingSeconds ?? 0),
    }));
  }

  /** Cinsiyet / yaş kırılımı — günlük rollup'tan; uzun aralıklarda çok daha ucuz. */
  async demographicBreakdown(filters: RollupFilters, dimension: "gender" | "ageBucket") {
    const rows = await this.prisma.demographicRollupDaily.groupBy({
      by: [dimension],
      where: this.buildWhere(filters),
      _sum: { sessionCount: true, personsLooked: true, lookingSeconds: true },
    });

    return rows.map((row) => ({
      key: String(row[dimension]),
      sessions: row._sum.sessionCount ?? 0,
      looked: row._sum.personsLooked ?? 0,
      lookingSeconds: Number(row._sum.lookingSeconds ?? 0),
    }));
  }

  private buildWhere(filters: RollupFilters) {
    const flooredFrom = new Date(filters.from);
    flooredFrom.setMinutes(0, 0, 0);
    return {
      bucketStart: { gte: flooredFrom, lte: filters.to },
      ...(filters.siteIds?.length ? { siteId: { in: filters.siteIds } } : {}),
      ...(filters.deviceIds?.length ? { deviceId: { in: filters.deviceIds } } : {}),
    };
  }
}
