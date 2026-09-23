import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../infra/logger.js";

/**
 * Her isteğe bir requestId ve o id'yi taşıyan bir alt logger bağlar.
 *
 * requestId hata yanıtında da döner; kullanıcının bildirdiği bir hatayı loglarda
 * tek bir grep ile bulmayı sağlar.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.length <= 64 ? incoming : randomUUID();

  req.requestId = requestId;
  req.log = logger.child({ requestId });
  res.setHeader("x-request-id", requestId);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    req.log.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      },
      "istek tamamlandı",
    );
  });

  next();
}
