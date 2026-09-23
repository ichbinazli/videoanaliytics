import type { ExtendedPrismaClient } from "../infra/prisma.js";
import type { LicenseStatus } from "../generated/prisma/enums.js";

export type LicenseRecord = {
  id: number;
  tenantId: number;
  status: LicenseStatus;
  plan: string;
  maxDevices: number;
  startsAt: Date;
  expiresAt: Date | null;
  suspendedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class LicenseRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  async findByTenantId(tenantId: number): Promise<LicenseRecord | null> {
    // We don't use runAsSystem here if we want tenant isolation to apply,
    // but typically license might be fetched within a tenant context.
    return this.prisma.license.findUnique({
      where: { tenantId },
    });
  }

  async create(data: Omit<LicenseRecord, "id" | "createdAt" | "updatedAt">): Promise<LicenseRecord> {
    return this.prisma.license.create({
      data,
    });
  }

  async updateStatus(
    tenantId: number,
    status: LicenseStatus,
    extra: Partial<LicenseRecord> = {}
  ): Promise<LicenseRecord> {
    return this.prisma.license.update({
      where: { tenantId },
      data: { status, ...extra },
    });
  }
}
