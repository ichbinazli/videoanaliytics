import type { NextFunction, Request, RequestHandler, Response } from "express";
import { API_KEY_HEADER, API_KEY_LAST_USED_DEBOUNCE_MS } from "../config/constants.js";
import { UnauthorizedError } from "../errors/httpErrors.js";
import { runAsTenant } from "../infra/tenantContext.js";
import { parseApiKey, verifyApiKeySecret } from "../security/apiKey.js";
import type { DeviceApiKeyRepository } from "../repositories/deviceApiKey.repository.js";

/**
 * Cihaz kimlik doğrulaması.
 *
 * Cihazın kim olduğu YALNIZCA API key'den çıkar; payload'da cihaz id'si yoktur
 * ve olsaydı da güvenilmezdi. Key çözüldükten sonra isteğin geri kalanı hemen
 * o cihazın tenant'ına kilitlenir — böylece ingest kodunun kalanı tenant'ı
 * düşünmek zorunda kalmaz.
 *
 * Hata mesajları bilinçli olarak ayrıntısız: bir saldırgan geçerli bir prefix
 * bulduğunu mesajdan anlamamalı.
 */
export function createDeviceAuth(apiKeys: DeviceApiKeyRepository): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = parseApiKey(req.header(API_KEY_HEADER));

    if (!parsed) {
      next(new UnauthorizedError("Geçersiz API key."));
      return;
    }

    void apiKeys
      .findActiveByPrefix(parsed.prefix)
      .then((record) => {
        if (!record || !verifyApiKeySecret(record.keyHash, parsed.secret)) {
          next(new UnauthorizedError("Geçersiz API key."));
          return;
        }

        req.device = {
          deviceId: record.deviceId,
          tenantId: record.tenantId,
          siteId: record.device.siteId,
          apiKeyId: record.id,
        };
        req.log = req.log.child({
          deviceId: record.deviceId,
          tenantId: record.tenantId,
        });

        // lastUsedAt'i her istekte yazmak, auth'u okuma işlemi olmaktan
        // çıkarırdı. Dakikada bir yeterli — bu alan teşhis içindir, muhasebe
        // için değil. Yazımın bitmesini de beklemiyoruz.
        const lastUsed = record.lastUsedAt?.getTime() ?? 0;
        if (Date.now() - lastUsed > API_KEY_LAST_USED_DEBOUNCE_MS) {
          void apiKeys.touchLastUsed(record.id).catch((error: unknown) => {
            req.log.warn({ err: error }, "lastUsedAt güncellenemedi");
          });
        }

        runAsTenant(record.tenantId, () => next());
      })
      .catch(next);
  };
}
