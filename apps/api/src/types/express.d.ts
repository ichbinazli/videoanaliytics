import type { Logger } from "pino";
import type { Role } from "../generated/prisma/enums.js";

/**
 * Express Request üzerine eklediğimiz alanlar.
 *
 * Her biri BELİRLİ bir middleware tarafından doldurulur; hangi route'ta hangisinin
 * dolu olduğu middleware zincirinden okunur:
 *   requestId/log -> requestContext (tüm istekler)
 *   auth          -> jwtAuth        (/api/*)
 *   device        -> deviceAuth     (/ingest/*)
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;

      /** Panel kullanıcısı. tenantId, SUPER_ADMIN için null'dır. */
      auth?: {
        userId: number;
        tenantId: number | null;
        role: Role;
      };

      /** Veri gönderen cihaz. Kimlik tamamen API key'den türetilir. */
      device?: {
        deviceId: number;
        tenantId: number;
        siteId: number;
        apiKeyId: number;
      };
    }
  }
}

export {};
