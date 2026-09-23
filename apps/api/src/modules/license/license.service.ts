import { ConflictError, NotFoundError } from "../../errors/httpErrors.js";
import type { LicenseRepository, LicenseRecord } from "../../repositories/license.repository.js";
import type { TenantRepository } from "../../repositories/tenant.repository.js";
import type { CreateLicenseDto, SuspendLicenseDto, CancelLicenseDto } from "./license.dto.js";

export class LicenseService {
  constructor(
    private readonly licenses: LicenseRepository,
    private readonly tenants: TenantRepository,
  ) {}

  async getLicense(tenantId: number): Promise<LicenseRecord> {
    const license = await this.licenses.findByTenantId(tenantId);
    if (!license) {
      throw new NotFoundError("Lisans bulunamadı");
    }
    return license;
  }

  async createLicense(dto: CreateLicenseDto): Promise<LicenseRecord> {
    const tenant = await this.tenants.findById(dto.tenantId);
    if (!tenant) {
      throw new NotFoundError("Müşteri (tenant) bulunamadı");
    }

    const existing = await this.licenses.findByTenantId(dto.tenantId);
    if (existing) {
      throw new ConflictError("Bu müşterinin zaten bir lisansı var");
    }

    return this.licenses.create({
      tenantId: dto.tenantId,
      status: "ACTIVE",
      plan: dto.plan,
      maxDevices: dto.maxDevices,
      startsAt: dto.startsAt,
      expiresAt: dto.expiresAt ?? null,
      suspendedAt: null,
      cancelledAt: null,
      cancelReason: null,
    });
  }

  async suspendLicense(tenantId: number, dto: SuspendLicenseDto): Promise<LicenseRecord> {
    const license = await this.getLicense(tenantId);
    if (license.status === "CANCELLED") {
      throw new ConflictError("İptal edilmiş lisans askıya alınamaz");
    }
    if (license.status === "SUSPENDED") {
      return license; // Zaten askıda
    }

    return this.licenses.updateStatus(tenantId, "SUSPENDED", {
      suspendedAt: new Date(),
      cancelReason: dto.reason ?? null, // Neden askıya alındığını not düşebiliriz
    });
  }

  async reactivateLicense(tenantId: number): Promise<LicenseRecord> {
    const license = await this.getLicense(tenantId);
    if (license.status === "CANCELLED") {
      throw new ConflictError("İptal edilmiş lisans yeniden aktifleştirilemez");
    }
    if (license.status === "ACTIVE") {
      return license;
    }

    return this.licenses.updateStatus(tenantId, "ACTIVE", {
      suspendedAt: null,
      cancelReason: null,
    });
  }

  async cancelLicense(tenantId: number, dto: CancelLicenseDto): Promise<LicenseRecord> {
    const license = await this.getLicense(tenantId);
    if (license.status === "CANCELLED") {
      return license;
    }

    return this.licenses.updateStatus(tenantId, "CANCELLED", {
      cancelledAt: new Date(),
      cancelReason: dto.reason,
    });
  }

  /**
   * Middleware'in her istekte hızlıca bakabilmesi için
   * `isActive` olup olmadığını döndürür.
   */
  async checkLicenseActive(tenantId: number): Promise<boolean> {
    const license = await this.licenses.findByTenantId(tenantId);
    if (!license) return false;
    
    if (license.status !== "ACTIVE") return false;

    // Süresi dolmuş mu kontrolü
    if (license.expiresAt && license.expiresAt < new Date()) {
      return false;
    }

    return true;
  }
}
