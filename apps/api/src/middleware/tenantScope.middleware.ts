import type { NextFunction, Request, Response } from "express";
import { TENANT_HEADER } from "../config/constants.js";
import { BadRequestError, UnauthorizedError } from "../errors/httpErrors.js";
import { Role } from "../generated/prisma/enums.js";
import { runAsSystem, runAsTenant } from "../infra/tenantContext.js";

/**
 * İsteğin geri kalanını doğru tenant scope'u içinde çalıştırır.
 *
 * Bu middleware'den sonraki HER Prisma sorgusu — controller, service, repository,
 * fark etmez — otomatik olarak tenantId ile sınırlanır (bkz. infra/prisma.ts).
 *
 * Rol davranışları:
 *   TENANT_ADMIN / TENANT_VIEWER -> token'daki tenant'a kilitlenir.
 *   SUPER_ADMIN                  -> X-Tenant-Id verirse o tenant'a girer;
 *                                   vermezse platform genelinde (system scope)
 *                                   çalışır. Octopus personeli tanımı gereği
 *                                   tenant'lar üstüdür; bu kasıtlıdır.
 */
export function tenantScope(req: Request, res: Response, next: NextFunction): void {
  const auth = req.auth;

  if (!auth) {
    // jwtAuth'tan önce bağlanmış demektir — programlama hatası.
    next(new UnauthorizedError("Kimlik doğrulanmadan tenant kapsamı açılamaz."));
    return;
  }

  if (auth.role === Role.SUPER_ADMIN) {
    const raw = req.header(TENANT_HEADER);

    if (raw === undefined || raw.trim() === "") {
      runAsSystem("SUPER_ADMIN: tenant seçilmedi, platform genelinde", () => next());
      return;
    }

    const tenantId = Number(raw);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      next(new BadRequestError(`${TENANT_HEADER} başlığı geçerli bir tenant id olmalı.`));
      return;
    }

    runAsTenant(tenantId, () => next());
    return;
  }

  if (auth.tenantId === null) {
    // SUPER_ADMIN olmayan bir kullanıcının tenant'ı olmak zorunda.
    next(new UnauthorizedError("Hesabınız bir müşteriye bağlı değil."));
    return;
  }

  runAsTenant(auth.tenantId, () => next());
}
