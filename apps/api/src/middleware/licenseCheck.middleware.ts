import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ForbiddenError } from "../errors/httpErrors.js";
import type { LicenseService } from "../modules/license/license.service.js";

/**
 * Cihazın bağlı olduğu müşterinin lisansının aktif olup olmadığını kontrol eder.
 * Bu middleware `createDeviceAuth` işleminden SONRA çalışmalıdır, çünkü
 * `req.device.tenantId` değerini kullanır.
 */
export function createLicenseCheck(licenseService: LicenseService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.device?.tenantId) {
      // Cihaz doğrulanmamışsa buraya düşmemesi lazım ama güvenlik amaçlı
      next(new ForbiddenError("Lisans doğrulanamadı (cihaz tanımsız)"));
      return;
    }

    void licenseService.checkLicenseActive(req.device.tenantId)
      .then((isActive) => {
        if (!isActive) {
          next(new ForbiddenError("Lisans aktif değil (süresi dolmuş veya askıya alınmış)."));
          return;
        }
        next();
      })
      .catch(next);
  };
}
