import type { NextFunction, Request, Response } from "express";
import { NotFoundError } from "../errors/httpErrors.js";

/** Hiçbir route eşleşmediğinde: HTML değil, diğer hatalarla aynı JSON zarfı. */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Böyle bir uç yok: ${req.method} ${req.path}`));
}
