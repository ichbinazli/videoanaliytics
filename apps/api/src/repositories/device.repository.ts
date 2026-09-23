import type { ExtendedPrismaClient } from "../infra/prisma.js";
import type { DeviceStatus } from "../generated/prisma/enums.js";
import { requireTenantId, runAsSystem } from "../infra/tenantContext.js";
import {
  paginated,
  toPrismaSkipTake,
  type OffsetPagination,
  type Paginated,
} from "../utils/pagination.js";

export type DeviceRecord = {
  id: number;
  tenantId: number;
  siteId: number;
  name: string;
  code: string;
  status: DeviceStatus;
  screenLabel: string | null;
  appVersion: string | null;
  lastSeenAt: Date | null;
  lastIngestAt: Date | null;
  lastSpoolDepth: number | null;
  createdAt: Date;
  site?: { id: number; name: string; code: string };
};

const deviceSelect = {
  id: true,
  tenantId: true,
  siteId: true,
  name: true,
  code: true,
  status: true,
  screenLabel: true,
  appVersion: true,
  lastSeenAt: true,
  lastIngestAt: true,
  lastSpoolDepth: true,
  createdAt: true,
  site: { select: { id: true, name: true, code: true } },
} as const;

export class DeviceRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  async list(
    pagination: OffsetPagination,
    filters: { siteId?: number; status?: DeviceStatus; search?: string } = {},
  ): Promise<Paginated<DeviceRecord>> {
    const where = {
      ...(filters.siteId !== undefined ? { siteId: filters.siteId } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search } },
              { code: { contains: filters.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        ...toPrismaSkipTake(pagination),
        orderBy: { name: "asc" },
        select: deviceSelect,
      }),
      this.prisma.device.count({ where }),
    ]);

    return paginated(items, total, pagination);
  }

  findById(id: number): Promise<DeviceRecord | null> {
    return this.prisma.device.findUnique({ where: { id }, select: deviceSelect });
  }

  create(data: {
    siteId: number;
    name: string;
    code: string;
    screenLabel?: string | null;
  }): Promise<DeviceRecord> {
    return this.prisma.device.create({
      data: { ...data, tenantId: requireTenantId("device.create") },
      select: deviceSelect,
    });
  }

  update(
    id: number,
    data: Partial<{
      siteId: number;
      name: string;
      screenLabel: string | null;
      status: DeviceStatus;
    }>,
  ): Promise<DeviceRecord> {
    return this.prisma.device.update({ where: { id }, data, select: deviceSelect });
  }

  /**
   * Heartbeat/ingest sonrası durum güncellemesi.
   *
   * runAsSystem: ingest zaten cihazın kendi tenant'ında çalışıyor, ama bu yazım
   * kullanıcı isteğinin değil cihazın bir yan etkisi. Yine de tenantId'yi elle
   * filtreliyoruz ki kaçış yolu bir boşluk açmasın.
   */
  markSeen(
    deviceId: number,
    tenantId: number,
    data: { appVersion?: string | null; spoolDepth?: number | null; ingested: boolean },
  ): Promise<unknown> {
    const now = new Date();

    return runAsSystem("cihaz heartbeat: tenantId elle filtreleniyor", () =>
      this.prisma.device.updateMany({
        where: { id: deviceId, tenantId },
        data: {
          lastSeenAt: now,
          ...(data.ingested ? { lastIngestAt: now } : {}),
          ...(data.appVersion ? { appVersion: data.appVersion } : {}),
          ...(data.spoolDepth !== undefined && data.spoolDepth !== null
            ? { lastSpoolDepth: data.spoolDepth }
            : {}),
        },
      }),
    );
  }

  /** Cihazı hizmetten çıkarır; kayıtları ve geçmiş verisi korunur. */
  decommission(id: number): Promise<DeviceRecord> {
    return this.prisma.device.update({
      where: { id },
      data: { status: "DECOMMISSIONED" },
      select: deviceSelect,
    });
  }
}
