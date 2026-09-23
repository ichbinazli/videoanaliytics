/**
 * Uygulamanın tüm beklenen hatalarının tabanı.
 *
 * Kural: kod hiçbir yerde `res.status(400).json(...)` yazmaz — `throw new
 * BadRequestError(...)` yazar. Yanıtı formatlayan tek yer
 * middleware/errorHandler.middleware.ts'tir.
 */
export class AppError extends Error {
  /** HTTP durum kodu. */
  readonly statusCode: number;

  /** İstemcinin şart koşabileceği sabit makine-okur kod (ör. VALIDATION_FAILED). */
  readonly code: string;

  /** İstemciye gösterilmesi güvenli ek bilgi. Sır içermez. */
  readonly details?: unknown;

  /**
   * Beklenen bir hata mı (true) yoksa programlama hatası mı (false)?
   * Beklenmeyen hatalarda mesaj istemciye sızdırılmaz ve stack loglanır.
   */
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: { details?: unknown; cause?: unknown; isOperational?: boolean },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
    this.isOperational = options?.isOperational ?? true;
    Error.captureStackTrace?.(this, new.target);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
