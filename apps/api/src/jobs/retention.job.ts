import { env } from "../config/env.js";
import { logger } from "../infra/logger.js";
import { prisma } from "../infra/prisma.js";
import { runAsSystem } from "../infra/tenantContext.js";
import type { RefreshTokenRepository } from "../repositories/refreshToken.repository.js";
import type { TenantRepository } from "../repositories/tenant.repository.js";

const DELETE_CHUNK = 5_000;

/**
 * Ham oturumların saklama süresi dolanları silinir.
 *
 * Rollup tabloları SÜRESİZ saklanır: ham satırların ~1/500'ü kadar yer kaplarlar
 * ve raporların tamamı zaten onlardan okunur. Yani müşteri iki yıl önceki ayı
 * hâlâ görebilir, sadece tekil oturum kayıtlarını göremez.
 *
 * Silme parçalı yapılıyor: tek bir DELETE milyonlarca satırı kilitleyip
 * replikasyonu tıkardı.
 */
export class RetentionJob {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async run(): Promise<{ deletedSessions: number; deletedTokens: number }> {
    const deletedSessions = await this.purgeRawSessions();
    const deletedTokens = await this.purgeExpiredTokens();

    if (deletedSessions > 0 || deletedTokens > 0) {
      logger.info({ deletedSessions, deletedTokens }, "retention turu tamamlandı");
    }

    return { deletedSessions, deletedTokens };
  }

  private async purgeRawSessions(): Promise<number> {
    const settings = await this.tenants.listRetentionSettings();
    let total = 0;

    for (const tenant of settings) {
      const days = tenant.rawRetentionDays ?? env.RAW_RETENTION_DAYS;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // runAsSystem + tenantId'yi ELLE filtreleme: iş, tanımı gereği tüm
      // tenant'lar üzerinde döner ama her silme tek bir tenant'a kilitli.
      for (;;) {
        const deleted = await runAsSystem("retention: tenant tenant temizlik", () =>
          prisma.$executeRaw`
            DELETE FROM viewer_sessions
            WHERE tenantId = ${tenant.id} AND startedAt < ${cutoff}
            LIMIT ${DELETE_CHUNK}
          `,
        );

        total += Number(deleted);
        if (Number(deleted) < DELETE_CHUNK) break;
      }
    }

    return total;
  }

  private async purgeExpiredTokens(): Promise<number> {
    const result = await this.refreshTokens.deleteExpired(new Date());
    return result.count;
  }
}
