import { z } from "zod";
import { offsetPaginationSchema } from "../../utils/pagination.js";
import { Role } from "../../generated/prisma/enums.js";

export const userListQuerySchema = offsetPaginationSchema;

const passwordSchema = z
  .string()
  .min(10, "Şifre en az 10 karakter olmalı")
  .max(200)
  .refine((value) => /[a-zA-Z]/.test(value) && /\d/.test(value), {
    message: "Şifre en az bir harf ve bir rakam içermeli",
  });

export const createUserSchema = z.object({
  email: z.email().max(190).toLowerCase().trim(),
  fullName: z.string().trim().min(1).max(120),
  password: passwordSchema,
  /**
   * SUPER_ADMIN bilinçli olarak seçenekler arasında YOK.
   * Platform yöneticisi API üzerinden oluşturulmaz — seed veya doğrudan DB ile
   * eklenir. Aksi hâlde ele geçirilen bir TENANT_ADMIN hesabı kendini
   * yükseltebilirdi.
   */
  role: z.enum([Role.TENANT_ADMIN, Role.TENANT_VIEWER]),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  role: z.enum([Role.TENANT_ADMIN, Role.TENANT_VIEWER]).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
