import { logger } from "../infra/logger.js";
import type { DirtyBucketRepository } from "../repositories/dirtyBucket.repository.js";
import type { RollupRepository } from "../repositories/rollup.repository.js";
import type { TenantRepository } from "../repositories/tenant.repository.js";
import { localDayStartUtc } from "../utils/time.js";

const BATCH_SIZE = 200;

/**
 * Kirli saat kovalarını boşaltan iş.
 *
 * Sözleşmesi tek cümleyle: kaç kez çalıştırılırsa çalıştırılsın sonuç aynıdır.
 * Bunu mümkün kılan şey, ham satırlardan YENİDEN HESAPLAMASI — sayaç
 * artırmaması. Bu yüzden:
 *   - cihaz retry'ları raporlara sızamaz,
 *   - üç gün offline kalmış bir cihazın verisi geldiğinde ilgili 72 kova
 *     doğru şekilde düzelir,
 *   - bir hata sonrası geriye dönük düzeltme (backfill) mümkündür.
 */
export class RollupJob {
  private running = false;

  constructor(
    private readonly dirtyBuckets: DirtyBucketRepository,
    private readonly rollups: RollupRepository,
    private readonly tenants: TenantRepository,
  ) {}

  /**
   * Bekleyen tüm kovaları işler.
   *
   * `running` kilidi, uzun süren bir çalışmanın üzerine cron'un ikinci bir
   * çalışma başlatmasını engeller — aynı kovayı iki worker'ın hesaplaması
   * yanlış sonuç vermezdi (idempotent) ama boşuna yük olurdu.
   */
  async run(): Promise<{ processed: number; cleared: number }> {
    if (this.running) {
      logger.debug("rollup job zaten çalışıyor, bu tur atlandı");
      return { processed: 0, cleared: 0 };
    }

    this.running = true;
    const startedAt = Date.now();
    let processed = 0;
    let cleared = 0;

    try {
      // Zaman dilimleri tur başına bir kez okunur; her kova için tenant
      // sorgulamak yüzlerce gereksiz sorgu demekti.
      const timezones = new Map<number, string>();

      for (;;) {
        const batch = await this.dirtyBuckets.claimBatch(BATCH_SIZE);
        if (batch.length === 0) break;

        const doneIds: bigint[] = [];

        for (const dirty of batch) {
          try {
            const tenantId = await this.processBucket(dirty.deviceId, dirty.bucketStart, timezones);
            if (tenantId !== null) processed += 1;
            doneIds.push(dirty.id);
          } catch (error) {
            // Tek bir kova patlarsa turu düşürmüyoruz; kayıt kuyrukta kalır ve
            // bir sonraki turda tekrar denenir.
            logger.error(
              { err: error, deviceId: dirty.deviceId, bucketStart: dirty.bucketStart },
              "rollup kovası hesaplanamadı",
            );
          }
        }

        // Silme İŞLEM BİTTİKTEN sonra: arada gelen yeni bir oturum kovayı
        // yeniden işaretlerse en fazla bir kez fazladan hesaplarız. Tersi veri
        // kaybı riski taşırdı.
        await this.dirtyBuckets.deleteByIds(doneIds);
        cleared += doneIds.length;

        if (batch.length < BATCH_SIZE) break;
      }

      if (processed > 0) {
        logger.info(
          { processed, cleared, durationMs: Date.now() - startedAt },
          "rollup turu tamamlandı",
        );
      }
    } finally {
      this.running = false;
    }

    return { processed, cleared };
  }

  private async processBucket(
    deviceId: number,
    bucketStart: Date,
    timezones: Map<number, string>,
  ): Promise<number | null> {
    const aggregate = await this.rollups.computeHourlyBucket(deviceId, bucketStart);

    if (!aggregate) {
      // Kovada satır kalmamış (retention sildi ya da veri düzeltildi):
      // rollup satırı da gitmeli, yoksa panelde hayalet veri kalır.
      await this.rollups.deleteHourly(deviceId, bucketStart);
      return null;
    }

    await this.rollups.upsertHourly(aggregate);

    // Aynı saatin ait olduğu YEREL günün demografi kırılımı da tazelenir.
    const timezone = await this.timezoneFor(aggregate.tenantId, timezones);
    const dayStart = localDayStartUtc(bucketStart, timezone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const demographics = await this.rollups.computeDemographicDay(deviceId, dayStart, dayEnd);
    await this.rollups.replaceDemographicDay(deviceId, dayStart, demographics);

    return aggregate.tenantId;
  }

  private async timezoneFor(
    tenantId: number,
    cache: Map<number, string>,
  ): Promise<string> {
    const cached = cache.get(tenantId);
    if (cached) return cached;

    const timezone = (await this.tenants.findTimezone(tenantId)) ?? "Europe/Istanbul";
    cache.set(tenantId, timezone);
    return timezone;
  }
}
