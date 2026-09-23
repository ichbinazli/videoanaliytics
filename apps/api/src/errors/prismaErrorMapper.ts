import { AppError } from "./AppError.js";
import { ConflictError, NotFoundError } from "./httpErrors.js";

/**
 * Prisma'nın hata kodlarını uygulama hatalarına çevirir.
 *
 * Böylece servis katmanı her sorgunun etrafına try/catch yazmak zorunda kalmaz;
 * errorHandler tek noktadan çeviriyi yapar.
 *
 * Kod listesi: https://www.prisma.io/docs/orm/reference/error-reference
 */

type PrismaKnownError = { code: string; meta?: Record<string, unknown> };

function isPrismaKnownError(error: unknown): error is PrismaKnownError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    /^P\d{4}$/.test((error as { code: string }).code)
  );
}

export function mapPrismaError(error: unknown): AppError | undefined {
  if (!isPrismaKnownError(error)) return undefined;

  switch (error.code) {
    // Unique kısıtı ihlali
    case "P2002": {
      const target = error.meta?.["target"];
      const fields = Array.isArray(target) ? target.join(", ") : String(target ?? "");
      return new ConflictError(
        fields ? `Bu değer zaten kullanılıyor: ${fields}` : "Kayıt zaten mevcut.",
        { cause: error },
      );
    }

    // Foreign key kısıtı ihlali — istemci var olmayan bir ilişkiye işaret etti
    case "P2003":
      return new ConflictError("İlişkili kayıt bulunamadı veya hâlâ kullanımda.", {
        cause: error,
      });

    // update/delete hedefi bulunamadı.
    // NOT: Tenant guard'ı yüzünden başka bir tenant'ın kaydına yapılan istek de
    // buraya düşer — ve 404 dönmesi tam olarak istediğimiz davranıştır.
    case "P2025":
      return new NotFoundError("Kayıt bulunamadı.", { cause: error });

    default:
      return undefined;
  }
}
