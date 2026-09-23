import { AppError } from "./AppError.js";

type ErrorOptions = { details?: unknown; cause?: unknown };

export class BadRequestError extends AppError {
  constructor(message = "Geçersiz istek.", options?: ErrorOptions) {
    super(400, "BAD_REQUEST", message, options);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Doğrulama başarısız.", options?: ErrorOptions) {
    super(400, "VALIDATION_FAILED", message, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Kimlik doğrulanamadı.", options?: ErrorOptions) {
    super(401, "UNAUTHORIZED", message, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Bu işlem için yetkiniz yok.", options?: ErrorOptions) {
    super(403, "FORBIDDEN", message, options);
  }
}

/**
 * Tenant sınırını aşan istekler de BUNU döner, ForbiddenError'ı değil.
 * 403 "vardı ama giremezsin" bilgisini sızdırır; başka bir tenant'ın kaynağı
 * bizim için hiç yoktur.
 */
export class NotFoundError extends AppError {
  constructor(message = "Kayıt bulunamadı.", options?: ErrorOptions) {
    super(404, "NOT_FOUND", message, options);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Kayıt zaten mevcut.", options?: ErrorOptions) {
    super(409, "CONFLICT", message, options);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Gönderilen veri çok büyük.", options?: ErrorOptions) {
    super(413, "PAYLOAD_TOO_LARGE", message, options);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Çok fazla istek gönderildi.", options?: ErrorOptions) {
    super(429, "TOO_MANY_REQUESTS", message, options);
  }
}

export class InternalError extends AppError {
  constructor(message = "Beklenmeyen bir hata oluştu.", options?: ErrorOptions) {
    super(500, "INTERNAL_ERROR", message, { ...options, isOperational: false });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Servis şu anda kullanılamıyor.", options?: ErrorOptions) {
    super(503, "SERVICE_UNAVAILABLE", message, options);
  }
}

/**
 * Tenant scope'u açılmadan tenant'a ait bir tabloya erişilmeye çalışıldı.
 *
 * Bu bir PROGRAMLAMA hatasıdır, kullanıcı hatası değil — bu yüzden 500. Prisma
 * guard extension'ı unutulmuş bir `where` klozunu sessiz bir veri sızıntısı
 * yerine bu hataya çevirir (bkz. infra/prisma.ts).
 */
export class TenantContextMissingError extends AppError {
  constructor(model: string, operation: string) {
    super(
      500,
      "TENANT_CONTEXT_MISSING",
      `Tenant scope'u açılmadan ${model}.${operation} çağrıldı. ` +
        `İşlemi runAsTenant() veya bilinçli olarak runAsSystem() içine alın.`,
      { isOperational: false },
    );
  }
}
