import { Router } from "express";
import express from "express";
import { INGEST_BODY_LIMIT } from "../../config/constants.js";
import { createDeviceAuth } from "../../middleware/deviceAuth.middleware.js";
import { ingestRateLimit } from "../../middleware/rateLimit.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createLicenseCheck } from "../../middleware/licenseCheck.middleware.js";
import type { DeviceApiKeyRepository } from "../../repositories/deviceApiKey.repository.js";
import type { LicenseService } from "../license/license.service.js";
import type { IngestController } from "./ingest.controller.js";
import { heartbeatSchema, sessionBatchSchema } from "./ingest.dto.js";

/**
 * Cihaz uçları.
 *
 * Panel zincirinden farkları bilinçli:
 *  - cookieParser YOK   : cihazlar tarayıcı değil, çerez taşımazlar
 *  - cors YOK           : tarayıcıdan çağrılmayacak, CORS'un anlamı yok
 *  - originCheck YOK    : CSRF tarayıcıya özgü bir saldırı
 *  - gövde limiti 1 MB  : panelin 10 katı; batch'ler büyük olabiliyor
 *
 * Sıra önemli: deviceAuth önce gelir ki rate limit CİHAZ başına uygulanabilsin.
 * IP başına olsaydı aynı mağazadaki NAT arkasındaki cihazlar birbirini boğardı.
 */
export function createIngestRouter(
  controller: IngestController,
  apiKeys: DeviceApiKeyRepository,
  licenseService: LicenseService,
): Router {
  const router = Router();
  const deviceAuth = createDeviceAuth(apiKeys);
  const licenseCheck = createLicenseCheck(licenseService);

  router.use(express.json({ limit: INGEST_BODY_LIMIT }), deviceAuth, licenseCheck, ingestRateLimit);

  router.post("/sessions", validate(sessionBatchSchema), controller.ingestSessions);
  router.post("/heartbeat", validate(heartbeatSchema), controller.heartbeat);

  return router;
}
