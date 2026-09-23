import { z } from "zod";

/**
 * DTO'lar hem doğrulama hem de yayınlanan sözleşmedir.
 * Controller'a buradan geçmemiş hiçbir veri ulaşmaz.
 */

export const loginSchema = z.object({
  email: z.email("Geçerli bir e-posta adresi girin").max(190).toLowerCase().trim(),
  password: z.string().min(1, "Şifre boş olamaz").max(200),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  companyName: z.string().trim().min(2, "Şirket adı en az 2 karakter olmalı").max(120),
  fullName: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı").max(120),
  email: z.email("Geçerli bir e-posta adresi girin").max(190).toLowerCase().trim(),
  password: z
    .string()
    .min(10, "Şifre en az 10 karakter olmalı")
    .max(200)
    .refine((value) => /[a-zA-Z]/.test(value) && /\d/.test(value), {
      message: "Şifre en az bir harf ve bir rakam içermeli",
    }),
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(10, "Yeni şifre en az 10 karakter olmalı")
    .max(200)
    .refine((value) => /[a-zA-Z]/.test(value) && /\d/.test(value), {
      message: "Yeni şifre en az bir harf ve bir rakam içermeli",
    }),
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
