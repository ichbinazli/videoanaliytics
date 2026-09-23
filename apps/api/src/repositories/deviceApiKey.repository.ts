import type { ExtendedPrismaClient } from "../infra/prisma.js";
import type { ApiKeyStatus } from "../generated/prisma/enums.js";
import { requireTenantId, runAsSystem } from "../infra/tenantContext.js";

export type ApiKeyMetadata = {
  id: number;
  deviceId: number;
  keyPrefix: string;
  label: string | null;
  status: ApiKeyStatus;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

/** Secret HİÇBİR sorguda dönmez — sadece hash saklanır ve o da dışarı çıkmaz. */
const metadataSelect = {
  id: true,
  deviceId: true,
  keyPrefix: true,
  label: true,
  status: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
  revokedAt: true,
} as const;

export class DeviceApiKeyRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  /**
   * Cihaz kimliğinin çözüldüğü sorgu.
   *
   * runAsSystem: tenant'ın ne olduğunu ancak bu sorgunun SONUCUNDAN
   * öğreniyoruz — API key'in tek işi zaten budur. Bulunan kaydın tenantId'si
   * hemen ardından runAsTenant ile scope'a yazılır (deviceAuth middleware'i).
   */
  findActiveByPrefix(keyPrefix: string) {
    return runAsSystem("cihaz auth: tenant, key çözülmeden bilinemez", () =>
      this.prisma.deviceApiKey.findFirst({
        where: {
          keyPrefix,
          status: "ACTIVE",
          // Rotasyon grace window'u: expiresAt null ise süresiz, doluysa
          // o tarihe kadar geçerli.
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          device: { status: { not: "DECOMMISSIONED" } },
        },
        select: {
          id: true,
          tenantId: true,
          deviceId: true,
          keyHash: true,
          lastUsedAt: true,
          device: { select: { siteId: true } },
        },
      }),
    );
  }

  /**
   * lastUsedAt güncellemesi — çağıran taraf debounce eder.
   * Her ingest isteğinde yazsaydık auth bir okuma olmaktan çıkardı.
   */
  touchLastUsed(id: number): Promise<unknown> {
    return runAsSystem("cihaz auth: lastUsedAt yan etkisi", () =>
      this.prisma.deviceApiKey.update({
        where: { id },
        data: { lastUsedAt: new Date() },
        select: { id: true },
      }),
    );
  }

  listForDevice(deviceId: number): Promise<ApiKeyMetadata[]> {
    return this.prisma.deviceApiKey.findMany({
      where: { deviceId },
      orderBy: { createdAt: "desc" },
      select: metadataSelect,
    });
  }

  countActiveForDevice(deviceId: number): Promise<number> {
    return this.prisma.deviceApiKey.count({
      where: { deviceId, status: "ACTIVE" },
    });
  }

  create(data: {
    deviceId: number;
    keyPrefix: string;
    keyHash: string;
    label?: string | null;
    createdById?: number | null;
  }): Promise<ApiKeyMetadata> {
    return this.prisma.deviceApiKey.create({
      data: { ...data, tenantId: requireTenantId("deviceApiKey.create") },
      select: metadataSelect,
    });
  }

  revoke(id: number): Promise<ApiKeyMetadata> {
    return this.prisma.deviceApiKey.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
      select: metadataSelect,
    });
  }

  /** Rotasyon: eski key'e bitiş tarihi yazılır, hemen iptal edilmez. */
  scheduleExpiry(id: number, expiresAt: Date): Promise<ApiKeyMetadata> {
    return this.prisma.deviceApiKey.update({
      where: { id },
      data: { expiresAt },
      select: metadataSelect,
    });
  }
}
