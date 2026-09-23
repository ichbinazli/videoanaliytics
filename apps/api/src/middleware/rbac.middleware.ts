import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../errors/httpErrors.js";
import type { Role } from "../generated/prisma/enums.js";

/**
 * Rol kontrolü.
 *
 * Roller "NEYİ yapabilirsin" sorusunu; tenant scope "KİMİN verisine
 * dokunabilirsin" sorusunu cevaplar. İkisi bilinçli olarak ayrı middleware'ler:
 * tek bir yerde birleştirilirse biri değiştirilirken diğeri sessizce bozulur.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError("Giriş yapmanız gerekiyor."));
      return;
    }

    if (!allowed.includes(req.auth.role)) {
      next(new ForbiddenError("Bu işlem için yetkiniz yok."));
      return;
    }

    next();
  };
}
