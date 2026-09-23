import type { NextFunction, Request, RequestHandler, Response } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { env, isTest } from "../config/env.js";
import { TooManyRequestsError } from "../errors/httpErrors.js";

/**
 * Hız sınırlama.
 *
 * v1'de bellek içi: tek process için doğru, çok process'e çıkıldığında Redis
 * destekli sürüme geçilmesi gerekir (rate-limiter-flexible aynı arayüzü sunar).
 * Şimdiden Redis eklemek, ihtiyaç duyulmayan bir bağımlılık demekti.
 *
 * Anahtar seçimi bilinçlidir:
 *   ingest -> cihaz id'si. IP olsaydı aynı mağazadaki NAT arkasındaki cihazlar
 *             birbirini boğardı.
 *   auth   -> IP + e-posta. Şifre denemelerini yavaşlatır.
 */

function limiter(points: number, durationSec: number) {
  return new RateLimiterMemory({ points, duration: durationSec });
}

function makeMiddleware(
  instance: ReturnType<typeof limiter>,
  keyOf: (req: Request) => string | undefined,
  message: string,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Testlerde kapalı: aksi hâlde test sırası limitlere takılır ve testler
    // birbirine bağımlı hâle gelir.
    if (isTest) {
      next();
      return;
    }

    const key = keyOf(req);
    if (!key) {
      next();
      return;
    }

    instance
      .consume(key)
      .then((result) => {
        res.setHeader("x-ratelimit-remaining", result.remainingPoints);
        next();
      })
      .catch((rejection: unknown) => {
        const retryAfterMs =
          typeof rejection === "object" && rejection !== null && "msBeforeNext" in rejection
            ? Number((rejection as { msBeforeNext: number }).msBeforeNext)
            : 60_000;

        res.setHeader("retry-after", Math.ceil(retryAfterMs / 1000));
        next(new TooManyRequestsError(message));
      });
  };
}

/** Cihaz başına ingest limiti. deviceAuth'tan SONRA bağlanır. */
export const ingestRateLimit: RequestHandler = makeMiddleware(
  limiter(env.INGEST_RATE_LIMIT_PER_MINUTE, 60),
  (req) => (req.device ? `device:${req.device.deviceId}` : undefined),
  "Cihaz için istek limiti aşıldı.",
);

/** Giriş denemeleri: IP + e-posta. */
export const loginRateLimit: RequestHandler = makeMiddleware(
  limiter(10, 60),
  (req) => {
    const email = (req.body as { email?: string } | undefined)?.email ?? "-";
    return `login:${req.ip}:${email.toLowerCase()}`;
  },
  "Çok fazla giriş denemesi. Bir dakika sonra tekrar deneyin.",
);

/** Panel için genel limit. */
export const apiRateLimit: RequestHandler = makeMiddleware(
  limiter(300, 60),
  (req) => (req.auth ? `user:${req.auth.userId}` : `ip:${req.ip}`),
  "İstek limiti aşıldı.",
);
