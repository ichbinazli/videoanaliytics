import { Router } from "express";
import { z } from "zod";
import { Role } from "../../generated/prisma/enums.js";
import { requireRole } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { NotFoundError } from "../../errors/httpErrors.js";
import { offsetPaginationSchema } from "../../utils/pagination.js";
import type { TenantRepository } from "../../repositories/tenant.repository.js";

/**
 * Tenant yönetimi — yalnızca SUPER_ADMIN.
 *
 * Bu modülde ayrı bir service katmanı YOK: hiçbir iş kuralı yok, yalnızca CRUD.
 * Boş bir pass-through servisi eklemek katman sayısını artırırdı, netliği değil.
 * Kural belirdiği anda (ör. tenant silme akışı) servis eklenir.
 */

const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug yalnızca küçük harf, rakam ve tire içerebilir"),
  timezone: z.string().trim().max(64).default("Europe/Istanbul"),
});

const updateTenantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().trim().max(64).optional(),
  isActive: z.boolean().optional(),
  rawRetentionDays: z.coerce.number().int().min(1).max(3650).nullish(),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export function createTenantRouter(tenants: TenantRepository): Router {
  const router = Router();
  router.use(requireRole(Role.SUPER_ADMIN));

  router.get("/", validate(offsetPaginationSchema, "query"), async (req, res) => {
    res.json(await tenants.list(req.validatedQuery as z.infer<typeof offsetPaginationSchema>));
  });

  router.post("/", validate(createTenantSchema), async (req, res) => {
    const tenant = await tenants.create(req.body as z.infer<typeof createTenantSchema>);
    res.status(201).json({ tenant });
  });

  router.get("/:id", validate(idParamSchema, "params"), async (req, res) => {
    const tenant = await tenants.findById(Number(req.params.id));
    if (!tenant) throw new NotFoundError("Müşteri bulunamadı.");
    res.json({ tenant });
  });

  router.patch(
    "/:id",
    validate(idParamSchema, "params"),
    validate(updateTenantSchema),
    async (req, res) => {
      const tenant = await tenants.update(
        Number(req.params.id),
        req.body as z.infer<typeof updateTenantSchema>,
      );
      res.json({ tenant });
    },
  );

  return router;
}
