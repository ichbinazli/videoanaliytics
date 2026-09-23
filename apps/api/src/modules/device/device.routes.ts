import { Router } from "express";
import { Role } from "../../generated/prisma/enums.js";
import { requireRole } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import type { DeviceController } from "./device.controller.js";
import {
  apiKeyParamsSchema,
  createDeviceSchema,
  deviceIdParamSchema,
  deviceListQuerySchema,
  issueApiKeySchema,
  updateDeviceSchema,
} from "./device.dto.js";

export function createDeviceRouter(controller: DeviceController): Router {
  const router = Router();
  const adminOnly = requireRole(Role.TENANT_ADMIN, Role.SUPER_ADMIN);

  router.get("/", validate(deviceListQuerySchema, "query"), controller.list);
  router.get("/:id", validate(deviceIdParamSchema, "params"), controller.getById);

  router.post("/", adminOnly, validate(createDeviceSchema), controller.create);
  router.patch(
    "/:id",
    adminOnly,
    validate(deviceIdParamSchema, "params"),
    validate(updateDeviceSchema),
    controller.update,
  );
  router.delete(
    "/:id",
    adminOnly,
    validate(deviceIdParamSchema, "params"),
    controller.decommission,
  );

  // API key yönetimi — okuma dahil yalnızca yöneticilere açık: key metadata'sı
  // (prefix, son kullanım) izleyici rolünün işine yaramaz, saldırı yüzeyi olur.
  router.get(
    "/:id/api-keys",
    adminOnly,
    validate(deviceIdParamSchema, "params"),
    controller.listApiKeys,
  );
  router.post(
    "/:id/api-keys",
    adminOnly,
    validate(deviceIdParamSchema, "params"),
    validate(issueApiKeySchema),
    controller.issueApiKey,
  );
  router.delete(
    "/:id/api-keys/:keyId",
    adminOnly,
    validate(apiKeyParamsSchema, "params"),
    controller.revokeApiKey,
  );

  return router;
}
