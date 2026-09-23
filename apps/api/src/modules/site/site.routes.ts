import { Router } from "express";
import { Role } from "../../generated/prisma/enums.js";
import { requireRole } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import type { SiteController } from "./site.controller.js";
import {
  createSiteSchema,
  idParamSchema,
  siteListQuerySchema,
  updateSiteSchema,
} from "./site.dto.js";

/**
 * Okuma her role açık; yazma yalnızca yöneticilere.
 * Tenant sınırı burada değil, zincirin daha üstündeki tenantScope + Prisma
 * guard'ı tarafından uygulanıyor.
 */
export function createSiteRouter(controller: SiteController): Router {
  const router = Router();
  const adminOnly = requireRole(Role.TENANT_ADMIN, Role.SUPER_ADMIN);

  router.get("/", validate(siteListQuerySchema, "query"), controller.list);
  router.get("/:id", validate(idParamSchema, "params"), controller.getById);

  router.post("/", adminOnly, validate(createSiteSchema), controller.create);
  router.patch(
    "/:id",
    adminOnly,
    validate(idParamSchema, "params"),
    validate(updateSiteSchema),
    controller.update,
  );
  router.delete(
    "/:id",
    adminOnly,
    validate(idParamSchema, "params"),
    controller.deactivate,
  );

  return router;
}
