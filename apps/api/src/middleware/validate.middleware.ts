import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../errors/httpErrors.js";

type Source = "body" | "query" | "params";

/**
 * Doğrulama middleware'i üreten factory.
 *
 * Controller'a HER ZAMAN parse edilmiş, tipi bilinen veri ulaşır — controller
 * içinde `req.body.foo as string` gibi bir satır görüyorsanız bir DTO eksik
 * demektir.
 *
 * Parse SONUCU geri yazılır: zod'un coerce/default/transform'ları böylece etkili olur.
 */
export function validate<T>(schema: ZodType<T>, source: Source = "body"): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(
        new ValidationError(
          source === "body" ? "Gönderilen veri geçersiz." : "Sorgu parametreleri geçersiz.",
          {
            details: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        ),
      );
      return;
    }

    // Express 5'te req.query bir getter; yeniden atamak yerine üzerine yazılmış
    // değeri ayrı bir alanda tutuyoruz.
    if (source === "query") {
      req.validatedQuery = result.data;
    } else {
      req[source] = result.data as never;
    }

    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      /** validate(schema, "query") tarafından doldurulur. */
      validatedQuery?: unknown;
    }
  }
}
