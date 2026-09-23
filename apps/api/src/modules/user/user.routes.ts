import { Router } from "express";
import { Role } from "../../generated/prisma/enums.js";
import { requireRole } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import type { UserController } from "./user.controller.js";
import {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  userListQuerySchema,
} from "./user.dto.js";

/**
 * Kullanıcı yönetiminin TAMAMI yönetici yetkisi ister — listeleme dahil.
 * TENANT_VIEWER'ın kendi tenant'ındaki kullanıcıların e-postalarını görmesi
 * için bir sebep yok.
 */
export function createUserRouter(controller: UserController): Router {
  const router = Router();
  router.use(requireRole(Role.TENANT_ADMIN, Role.SUPER_ADMIN));

  router.get("/", validate(userListQuerySchema, "query"), controller.list);
  router.post("/", validate(createUserSchema), controller.create);
  router.get("/:id", validate(userIdParamSchema, "params"), controller.getById);
  router.patch(
    "/:id",
    validate(userIdParamSchema, "params"),
    validate(updateUserSchema),
    controller.update,
  );
  router.delete("/:id", validate(userIdParamSchema, "params"), controller.remove);

  return router;
}
