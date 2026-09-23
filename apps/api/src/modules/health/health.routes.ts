import { Router } from "express";
import { pingDatabase } from "../../infra/prisma.js";
import { ServiceUnavailableError } from "../../errors/httpErrors.js";

/**
 * Operasyonel uçlar. Kimlik doğrulaması YOKTUR ve olmamalıdır — load balancer
 * ile orchestrator'ın erişebilmesi gerekir. Hiçbir iş verisi sızdırmazlar.
 */
export const healthRouter: Router = Router();

/** Liveness: process ayakta mı? Bağımlılıklara bakmaz. */
healthRouter.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptimeSec: Math.round(process.uptime()) });
});

/** Readiness: trafik alabilir mi? Veritabanına gerçekten dokunur. */
healthRouter.get("/readyz", async (_req, res) => {
  try {
    await pingDatabase();
  } catch (error) {
    throw new ServiceUnavailableError("Veritabanına ulaşılamıyor.", { cause: error });
  }
  res.json({ status: "ready" });
});
