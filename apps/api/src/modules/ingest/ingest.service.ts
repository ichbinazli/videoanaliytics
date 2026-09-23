import { env } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import type { DeviceRepository } from "../../repositories/device.repository.js";
import type { DirtyBucketRepository } from "../../repositories/dirtyBucket.repository.js";
import type { ViewerSessionRepository } from "../../repositories/viewerSession.repository.js";
import { floorToUtcHour } from "../../utils/time.js";
import type { HeartbeatDto, IngestResult, SessionBatchDto } from "./ingest.dto.js";
import { RejectReason } from "./ingest.dto.js";
import { toViewerSession, type ViewerSessionInput } from "./ingest.mapper.js";

export type DeviceContext = {
  deviceId: number;
  tenantId: number;
  siteId: number;
};

export class IngestService {
  constructor(
    private readonly sessions: ViewerSessionRepository,
    private readonly dirtyBuckets: DirtyBucketRepository,
    private readonly devices: DeviceRepository,
  ) {}

  /**
   * Bir batch'i işler.
   *
   * Sözleşmenin kalbi: kısmi başarı BAŞARIDIR. Tek bozuk kayıt yüzünden 4xx
   * dönmek, cihazın o batch'i sonsuza kadar yeniden denemesine ve kuyruğun
   * başının tıkanmasına yol açardı. Bunun yerine kabul edilen, tekrar olan ve
   * reddedilen kayıtlar ayrı ayrı raporlanır; cihaz üçünü de kuyruktan siler.
   */
  async ingestSessions(
    batch: SessionBatchDto,
    device: DeviceContext,
  ): Promise<IngestResult> {
    const now = new Date();
    const appVersion = batch.device?.appVersion ?? null;

    const rejected: IngestResult["rejected"] = [];
    const accepted: ViewerSessionInput[] = [];

    for (const session of batch.sessions) {
      const reason = this.validateWindow(session.startedAt, session.endedAt, now);

      if (reason) {
        rejected.push({ sessionUuid: session.sessionUuid, reason });
        continue;
      }

      accepted.push(toViewerSession(session, { ...device, appVersion }));
    }

    const insertedCount = accepted.length > 0 ? await this.sessions.createMany(accepted) : 0;
    const duplicates = accepted.length - insertedCount;

    // Etkilenen saat kovalarını işaretle. Tekrarlar için de işaretliyoruz:
    // ucuz (skipDuplicates) ve daha önce başarısız olmuş bir rollup'ı
    // kurtarabilir.
    if (accepted.length > 0) {
      await this.dirtyBuckets.mark(
        dedupeBuckets(
          accepted.map((session) => ({
            deviceId: session.deviceId,
            bucketStart: floorToUtcHour(session.startedAt),
          })),
        ),
      );
    }

    await this.devices.markSeen(device.deviceId, device.tenantId, {
      appVersion,
      spoolDepth: batch.device?.spoolDepth ?? null,
      ingested: true,
    });

    if (rejected.length > 0) {
      logger.warn(
        { deviceId: device.deviceId, rejected },
        "ingest: bazı oturumlar reddedildi",
      );
    }

    return {
      accepted: insertedCount,
      duplicates,
      rejected,
      serverTime: now.toISOString(),
    };
  }

  async heartbeat(dto: HeartbeatDto, device: DeviceContext): Promise<{ serverTime: string }> {
    await this.devices.markSeen(device.deviceId, device.tenantId, {
      appVersion: dto.appVersion ?? null,
      spoolDepth: dto.spoolDepth ?? null,
      ingested: false,
    });

    return { serverTime: new Date().toISOString() };
  }

  /**
   * Saat kayması penceresi.
   *
   * Kiosk saatleri gerçekten kayıyor (RTC pili biten cihazlar 1970'e düşüyor).
   * Bu kayıtları reddetmezsek raporlar kullanılamaz hâle gelir; 4xx ile
   * reddedersek kuyruk tıkanır. Doğru cevap: kaydı düşür, batch'i kabul et.
   */
  private validateWindow(
    startedAt: Date,
    endedAt: Date,
    now: Date,
  ): RejectReason | undefined {
    if (endedAt.getTime() < startedAt.getTime()) {
      return RejectReason.END_BEFORE_START;
    }

    const futureLimit = now.getTime() + env.INGEST_CLOCK_SKEW_FUTURE_HOURS * 60 * 60 * 1000;
    const pastLimit = now.getTime() - env.INGEST_CLOCK_SKEW_PAST_DAYS * 24 * 60 * 60 * 1000;

    if (startedAt.getTime() > futureLimit || startedAt.getTime() < pastLimit) {
      return RejectReason.TIMESTAMP_OUT_OF_WINDOW;
    }

    return undefined;
  }
}

function dedupeBuckets(
  entries: Array<{ deviceId: number; bucketStart: Date }>,
): Array<{ deviceId: number; bucketStart: Date }> {
  const seen = new Map<string, { deviceId: number; bucketStart: Date }>();

  for (const entry of entries) {
    seen.set(`${entry.deviceId}:${entry.bucketStart.getTime()}`, entry);
  }

  return [...seen.values()];
}
