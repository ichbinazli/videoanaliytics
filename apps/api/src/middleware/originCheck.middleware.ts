import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { ForbiddenError } from "../errors/httpErrors.js";

/**
 * CSRF koruması.
 *
 * Oturum çerezleri SameSite=Lax; bu, üçüncü taraf bir sitenin POST/PATCH/DELETE
 * isteğinde çerezin gönderilmesini zaten engeller. Buradaki Origin allowlist'i
 * ikinci savunma hattıdır: tarayıcı davranışına tek başına güvenmiyoruz.
 *
 * Double-submit token'a gerek yok — panel ile API aynı origin altında
 * (Next.js rewrite'ı sayesinde) çalışıyor.
 *
 * GET/HEAD/OPTIONS muaf: durum değiştirmezler.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function originCheck(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.header("origin");

  // Origin başlığı yoksa istek tarayıcıdan gelmiyordur (curl, sunucu-sunucu).
  // Bunlar çerez de taşımadığı için CSRF riski oluşturmaz; jwtAuth zaten
  // yetkisiz olanı durdurur.
  if (!origin) {
    next();
    return;
  }

  if (!env.CORS_ORIGINS.includes(origin)) {
    req.log.warn({ origin }, "izin verilmeyen origin'den durum değiştiren istek");
    next(new ForbiddenError("İsteğin kaynağına izin verilmiyor."));
    return;
  }

  next();
}
