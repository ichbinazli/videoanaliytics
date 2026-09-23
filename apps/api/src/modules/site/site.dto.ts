import { z } from "zod";
import { offsetPaginationSchema } from "../../utils/pagination.js";

export const siteListQuerySchema = offsetPaginationSchema.extend({
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  search: z.string().trim().min(1).max(80).optional(),
});

export type SiteListQuery = z.infer<typeof siteListQuerySchema>;

export const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Müşterinin kendi mağaza kodu; tenant içinde tekil. */
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Kod yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir")
    .transform((value) => value.toUpperCase()),
  city: z.string().trim().max(80).nullish(),
  address: z.string().trim().max(255).nullish(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
});

export type CreateSiteDto = z.infer<typeof createSiteSchema>;

/** Kod değiştirilemez: geçmiş raporlarda ve entegrasyonlarda referans olarak kullanılıyor. */
export const updateSiteSchema = createSiteSchema.omit({ code: true }).partial();

export type UpdateSiteDto = z.infer<typeof updateSiteSchema>;

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
