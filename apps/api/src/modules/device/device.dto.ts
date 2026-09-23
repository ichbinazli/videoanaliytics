import { z } from "zod";
import { offsetPaginationSchema } from "../../utils/pagination.js";
import { DeviceStatus } from "../../generated/prisma/enums.js";

export const deviceListQuerySchema = offsetPaginationSchema.extend({
  siteId: z.coerce.number().int().positive().optional(),
  status: z
    .enum([DeviceStatus.ACTIVE, DeviceStatus.INACTIVE, DeviceStatus.DECOMMISSIONED])
    .optional(),
  search: z.string().trim().min(1).max(80).optional(),
});

export type DeviceListQuery = z.infer<typeof deviceListQuerySchema>;

export const createDeviceSchema = z.object({
  siteId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  /** Kiosk'un üstüne yazılan kod; tenant içinde tekil. */
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Kod yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir")
    .transform((value) => value.toUpperCase()),
  screenLabel: z.string().trim().max(120).nullish(),
});

export type CreateDeviceDto = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = z.object({
  siteId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  screenLabel: z.string().trim().max(120).nullish(),
  status: z.enum([DeviceStatus.ACTIVE, DeviceStatus.INACTIVE]).optional(),
});

export type UpdateDeviceDto = z.infer<typeof updateDeviceSchema>;

export const issueApiKeySchema = z.object({
  label: z.string().trim().max(80).optional(),
  /**
   * true ise mevcut aktif key'ler hemen iptal edilmez; bir grace window
   * boyunca çalışmaya devam eder. Sahadaki cihazı güncellemek için zaman verir.
   */
  rotate: z.boolean().default(false),
});

export type IssueApiKeyDto = z.infer<typeof issueApiKeySchema>;

export const deviceIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const apiKeyParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  keyId: z.coerce.number().int().positive(),
});
