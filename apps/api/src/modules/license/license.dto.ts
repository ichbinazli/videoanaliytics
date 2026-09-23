import { z } from "zod";

export const createLicenseSchema = z.object({
  tenantId: z.coerce.number().int().positive(),
  plan: z.string().min(1).max(40),
  maxDevices: z.coerce.number().int().positive(),
  startsAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export type CreateLicenseDto = z.infer<typeof createLicenseSchema>;

export const suspendLicenseSchema = z.object({
  reason: z.string().max(255).optional(),
});

export type SuspendLicenseDto = z.infer<typeof suspendLicenseSchema>;

export const cancelLicenseSchema = z.object({
  reason: z.string().min(1).max(255),
});

export type CancelLicenseDto = z.infer<typeof cancelLicenseSchema>;
