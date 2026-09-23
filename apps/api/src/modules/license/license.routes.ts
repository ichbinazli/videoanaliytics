import { Router } from "express";
import { currentTenantId } from "../../infra/tenantContext.js";
import { ForbiddenError } from "../../errors/httpErrors.js";
import type { LicenseService } from "./license.service.js";
import { createLicenseSchema, suspendLicenseSchema, cancelLicenseSchema } from "./license.dto.js";

export function createLicenseRouter(licenseService: LicenseService): Router {
  const router = Router();

  // Müşteri kendi lisansını görebilir
  router.get("/my-license", async (req, res, next) => {
    try {
      const tenantId = currentTenantId();
      if (!tenantId) {
        throw new ForbiddenError("Geçerli bir müşteri oturumu yok");
      }
      const license = await licenseService.getLicense(tenantId);
      res.json(license);
    } catch (err) {
      next(err);
    }
  });

  // Geri kalan her şey SUPER_ADMIN (Platform yöneticisi) yetkisindedir.
  // Gerçek uygulamada router bazında veya role guard ile korunmalıdır.
  // Şimdilik sadece endpoint'leri tanımlıyoruz.

  router.post("/", async (req, res, next) => {
    try {
      const dto = createLicenseSchema.parse(req.body);
      const license = await licenseService.createLicense(dto);
      res.status(201).json(license);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:tenantId", async (req, res, next) => {
    try {
      const tenantId = parseInt(req.params.tenantId, 10);
      const license = await licenseService.getLicense(tenantId);
      res.json(license);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:tenantId/suspend", async (req, res, next) => {
    try {
      const tenantId = parseInt(req.params.tenantId, 10);
      const dto = suspendLicenseSchema.parse(req.body);
      const license = await licenseService.suspendLicense(tenantId, dto);
      res.json(license);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:tenantId/reactivate", async (req, res, next) => {
    try {
      const tenantId = parseInt(req.params.tenantId, 10);
      const license = await licenseService.reactivateLicense(tenantId);
      res.json(license);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:tenantId/cancel", async (req, res, next) => {
    try {
      const tenantId = parseInt(req.params.tenantId, 10);
      const dto = cancelLicenseSchema.parse(req.body);
      const license = await licenseService.cancelLicense(tenantId, dto);
      res.json(license);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
