import type { ExtendedPrismaClient } from "../infra/prisma.js";
import { runAsSystem } from "../infra/tenantContext.js";

/**
 * Yeniden hesaplanmayı bekleyen saat kovaları.
 *
 * Tenant'a ait bir tablo DEĞİL: yalnızca (deviceId, bucketStart) çifti tutar ve
 * sadece ingest ile rollup job'ı dokunur. Bu yüzden guard extension'ının
 * kapsamı dışında ve system scope'unda çalışır.
 */
export class DirtyBucketRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  private run<T>(fn: () => T): T {
    return runAsSystem("rollup kuyruğu: tenant'a ait olmayan iç tablo", fn);
  }

  /**
   * Etkilenen kovaları işaretler.
   *
   * skipDuplicates: aynı kova zaten kuyruktaysa ikinci kez eklemenin anlamı yok
   * — worker onu nasılsa yeniden hesaplayacak.
   */
  async mark(entries: Array<{ deviceId: number; bucketStart: Date }>): Promise<number> {
    if (entries.length === 0) return 0;

    const result = await this.run(() =>
      this.prisma.rollupDirtyBucket.createMany({
        data: entries,
        skipDuplicates: true,
      }),
    );

    return result.count;
  }

  /** Worker'ın işleyeceği parti. */
  claimBatch(limit: number) {
    return this.run(() =>
      this.prisma.rollupDirtyBucket.findMany({
        orderBy: { id: "asc" },
        take: limit,
      }),
    );
  }

  /**
   * İşlenen kovaları siler.
   *
   * Hesaplama BİTTİKTEN sonra siliniyor: arada gelen yeni bir oturum kovayı
   * tekrar işaretlerse en kötü ihtimalle bir kez fazladan hesaplarız. Tersi
   * (önce sil, sonra hesapla) veri kaybı riski taşırdı.
   */
  deleteByIds(ids: bigint[]): Promise<unknown> {
    if (ids.length === 0) return Promise.resolve(0);
    return this.run(() =>
      this.prisma.rollupDirtyBucket.deleteMany({ where: { id: { in: ids } } }),
    );
  }

  pendingCount(): Promise<number> {
    return this.run(() => this.prisma.rollupDirtyBucket.count());
  }
}
