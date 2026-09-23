import type { ExtendedPrismaClient } from "../infra/prisma.js";
import { runAsSystem } from "../infra/tenantContext.js";

/**
 * Refresh token'lar tenantId taşımaz — userId üzerinden zaten kapalıdırlar.
 * Bu yüzden tüm işlemler system scope'unda çalışır; token doğrulaması tenant
 * bilinmeden ÖNCE gerçekleşmek zorunda olduğu için başka türlü de olamazdı.
 */
export class RefreshTokenRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  private run<T>(fn: () => T): T {
    return runAsSystem("refresh token: tenant'tan bağımsız, userId ile kapalı", fn);
  }

  create(data: {
    userId: number;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.run(() => this.prisma.refreshToken.create({ data }));
  }

  findByHash(tokenHash: string) {
    return this.run(() => this.prisma.refreshToken.findUnique({ where: { tokenHash } }));
  }

  revokeById(id: number) {
    return this.run(() =>
      this.prisma.refreshToken.update({
        where: { id },
        data: { revokedAt: new Date() },
      }),
    );
  }

  /**
   * Bir ailenin tamamını iptal eder.
   *
   * İki durumda çağrılır: normal çıkışta ve REUSE tespitinde. İkincisi kritik —
   * zaten döndürülmüş bir token yeniden sunulduysa ya bir kopya çalınmıştır ya
   * da istemci bozuktur; her iki hâlde de doğru cevap tüm aileyi düşürmektir.
   */
  revokeFamily(userId: number, familyId: string) {
    return this.run(() =>
      this.prisma.refreshToken.updateMany({
        where: { userId, familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  /** Şifre değişiminde: kullanıcının tüm oturumlarını kapat. */
  revokeAllForUser(userId: number) {
    return this.run(() =>
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  /** Süresi geçmiş kayıtları temizler (zamanlanmış iş). */
  deleteExpired(before: Date) {
    return this.run(() =>
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: before } } }),
    );
  }
}
