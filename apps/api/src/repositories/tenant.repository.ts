import type { ExtendedPrismaClient } from "../infra/prisma.js";
import { runAsSystem } from "../infra/tenantContext.js";
import {
  paginated,
  toPrismaSkipTake,
  type OffsetPagination,
  type Paginated,
} from "../utils/pagination.js";

/**
 * Tenant tablosu tenant'a AİT değildir — tenant'ın kendisidir. Bu yüzden guard
 * extension'ının kapsamı dışında ve tüm işlemler system scope'unda çalışır.
 * Erişimi rol katmanı sınırlar: yalnızca SUPER_ADMIN.
 */
export type TenantRecord = {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  isActive: boolean;
  rawRetentionDays: number | null;
  createdAt: Date;
};

export class TenantRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  private run<T>(fn: () => T): T {
    return runAsSystem("tenant yönetimi: tenant'lar üstü işlem", fn);
  }

  async list(pagination: OffsetPagination): Promise<Paginated<TenantRecord>> {
    const [items, total] = await this.run(() =>
      Promise.all([
        this.prisma.tenant.findMany({
          ...toPrismaSkipTake(pagination),
          orderBy: { name: "asc" },
        }),
        this.prisma.tenant.count(),
      ]),
    );

    return paginated(items, total, pagination);
  }

  findById(id: number) {
    return this.run(() => this.prisma.tenant.findUnique({ where: { id } }));
  }

  /** Günlük agregasyonların hangi yerel güne düşeceğini belirlemek için. */
  findTimezone(id: number): Promise<string | undefined> {
    return this.run(async () => {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id },
        select: { timezone: true },
      });
      return tenant?.timezone;
    });
  }

  create(data: { name: string; slug: string; timezone?: string }) {
    return this.run(() => this.prisma.tenant.create({ data }));
  }

  createWithAdmin(data: {
    name: string;
    slug: string;
    admin: { email: string; fullName: string; passwordHash: string };
  }) {
    return this.run(() =>
      this.prisma.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
          users: {
            create: {
              ...data.admin,
              role: "TENANT_ADMIN",
            },
          },
        },
        include: { users: true },
      }),
    );
  }

  update(
    id: number,
    data: Partial<{
      name: string;
      timezone: string;
      isActive: boolean;
      rawRetentionDays: number | null;
    }>,
  ) {
    return this.run(() => this.prisma.tenant.update({ where: { id }, data }));
  }

  /** Retention job'u için: her tenant'ın saklama süresi. */
  listRetentionSettings() {
    return this.run(() =>
      this.prisma.tenant.findMany({
        select: { id: true, rawRetentionDays: true },
      }),
    );
  }
}
