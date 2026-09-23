import type { ExtendedPrismaClient } from "../infra/prisma.js";
import { requireTenantId } from "../infra/tenantContext.js";
import {
  paginated,
  toPrismaSkipTake,
  type OffsetPagination,
  type Paginated,
} from "../utils/pagination.js";

export type SiteRecord = {
  id: number;
  tenantId: number;
  name: string;
  code: string;
  city: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type SiteWriteData = {
  name: string;
  code: string;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const siteSelect = {
  id: true,
  tenantId: true,
  name: true,
  code: true,
  city: true,
  address: true,
  isActive: true,
  createdAt: true,
} as const;

/**
 * Dikkat: buradaki hiçbir metotta `tenantId` filtresi YOK — bilerek.
 * Guard extension'ı onu her sorguya kendisi ekler. Elle eklemek, filtrenin
 * kimi yerde unutulabileceği izlenimini yaratırdı.
 */
export class SiteRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  async list(
    pagination: OffsetPagination,
    filters: { isActive?: boolean; search?: string } = {},
  ): Promise<Paginated<SiteRecord>> {
    const where = {
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search } },
              { code: { contains: filters.search } },
              { city: { contains: filters.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.site.findMany({
        where,
        ...toPrismaSkipTake(pagination),
        orderBy: { name: "asc" },
        select: siteSelect,
      }),
      this.prisma.site.count({ where }),
    ]);

    return paginated(items, total, pagination);
  }

  findById(id: number): Promise<SiteRecord | null> {
    return this.prisma.site.findUnique({ where: { id }, select: siteSelect });
  }

  create(data: SiteWriteData): Promise<SiteRecord> {
    return this.prisma.site.create({
      data: { ...data, tenantId: requireTenantId("site.create") },
      select: siteSelect,
    });
  }

  update(id: number, data: Partial<SiteWriteData>): Promise<SiteRecord> {
    return this.prisma.site.update({ where: { id }, data, select: siteSelect });
  }

  /**
   * Yumuşak silme: mağazaya bağlı geçmiş oturumlar duruyor, kaydı gerçekten
   * silmek onları kimliksiz bırakırdı.
   */
  deactivate(id: number): Promise<SiteRecord> {
    return this.prisma.site.update({
      where: { id },
      data: { isActive: false },
      select: siteSelect,
    });
  }
}
