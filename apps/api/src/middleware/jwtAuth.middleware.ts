import type { NextFunction, Request, Response } from "express";
import { ACCESS_COOKIE } from "../config/constants.js";
import { UnauthorizedError } from "../errors/httpErrors.js";
import { verifyAccessToken } from "../security/jwt.js";

/**
 * Access token'ı doğrular ve req.auth'u doldurur.
 *
 * KRİTİK: tenantId TOKEN'DAN gelir, istekten asla. Bir tenant kullanıcısının
 * gönderdiği `?tenantId=5` veya gövdedeki bir tenantId hiçbir zaman dikkate
 * alınmaz — imzalı token dışında tenant kimliğinin başka kaynağı yoktur.
 */
export function jwtAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;

  if (!token) {
    next(new UnauthorizedError("Giriş yapmanız gerekiyor."));
    return;
  }

  void verifyAccessToken(token)
    .then((claims) => {
      if (!claims) {
        // Süresi dolmuş token da buraya düşer; panel bunu görünce
        // /auth/refresh'e gidip tekrar dener.
        next(new UnauthorizedError("Oturum geçersiz veya süresi dolmuş."));
        return;
      }

      req.auth = claims;
      req.log = req.log.child({ userId: claims.userId, tenantId: claims.tenantId });
      next();
    })
    .catch(next);
}
