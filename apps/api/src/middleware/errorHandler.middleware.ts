import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, isAppError } from "../errors/AppError.js";
import { InternalError, PayloadTooLargeError, ValidationError } from "../errors/httpErrors.js";
import { mapPrismaError } from "../errors/prismaErrorMapper.js";
import { isProduction } from "../config/env.js";

/**
 * Hata yanıtını formatlayan TEK yer.
 *
 * Express 5, async handler'lardan yükselen reddedilmiş promise'leri kendisi bu
 * middleware'e yönlendirir; ayrıca bir asyncHandler sarmalayıcısına gerek yoktur.
 */

type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
};

function normalize(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    return new ValidationError("Gönderilen veri geçersiz.", {
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      cause: error,
    });
  }

  const prismaError = mapPrismaError(error);
  if (prismaError) return prismaError;

  // body-parser'ın limit aşımı. Cihazlar 413 görünce batch'lerini yarıya
  // indirdiği için bunu doğru koda çevirmek işlevsel olarak önemlidir.
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { type?: string }).type === "entity.too.large"
  ) {
    return new PayloadTooLargeError();
  }

  if (
    typeof error === "object" &&
    error !== null &&
    (error as { type?: string }).type === "entity.parse.failed"
  ) {
    return new ValidationError("Gövde geçerli JSON değil.", { cause: error });
  }

  return new InternalError(undefined, { cause: error });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Yanıt akışı başladıysa (ör. CSV stream'i) Express'in varsayılan davranışına bırak.
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = normalize(error);
  const log = req.log ?? console;

  if (appError.isOperational) {
    log.warn?.(
      { err: appError, code: appError.code, status: appError.statusCode },
      appError.message,
    );
  } else {
    // Programlama hatası: stack ile birlikte tam kayıt.
    log.error?.({ err: appError.cause ?? appError }, "beklenmeyen hata");
  }

  const body: ErrorBody = {
    error: {
      code: appError.code,
      // Beklenmeyen hatalarda iç mesaj istemciye sızdırılmaz.
      message:
        appError.isOperational || !isProduction
          ? appError.message
          : "Beklenmeyen bir hata oluştu.",
      requestId: req.requestId ?? "-",
    },
  };

  if (appError.details !== undefined) {
    body.error.details = appError.details;
  }

  res.status(appError.statusCode).json(body);
}
