import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { API_BODY_LIMIT } from "./config/constants.js";
import { env } from "./config/env.js";
import { buildContainer, type Container } from "./container.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { createApiRouter } from "./routes/api.router.js";
import { createIngestRouter } from "./modules/ingest/ingest.routes.js";
import { requestContext } from "./middleware/requestContext.middleware.js";
import { originCheck } from "./middleware/originCheck.middleware.js";
import { notFound } from "./middleware/notFound.middleware.js";
import { errorHandler } from "./middleware/errorHandler.middleware.js";

/**
 * Uygulamayı KURAR ama dinlemeye başlamaz.
 *
 * Bu ayrım testler için: supertest, gerçek bir port açmadan createApp() çıktısına
 * istek atabilir. Portu açan tek yer server.ts'tir.
 *
 * İki route ailesi bilinçli olarak ayrı middleware zincirleri kullanır:
 *
 *   /ingest/v1/*  cihaz API key'i, sadece yazma, cookie yok, CORS yok, 1 MB gövde
 *   /api/v1/*     kullanıcı JWT'si (httpOnly cookie), CORS + CSRF, 100 KB gövde
 *
 * Aynı process, iki farklı güvenlik modeli. Zincirlerin ayrı olması bunu
 * kodda GÖRÜNÜR kılar.
 */
export function createApp(container: Container = buildContainer()): Express {
  const app = express();

  // Nginx/ingress arkasında çalışacak: doğru istemci IP'si ve protokolü için.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(requestContext);

  // --- Operasyonel uçlar (auth yok) ---------------------------------------
  app.use(healthRouter);

  // --- /api/v1/* — panel --------------------------------------------------
  app.use(
    "/api/v1",
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true, // çerezlerin gidebilmesi için şart
    }),
    cookieParser(),
    express.json({ limit: API_BODY_LIMIT }),
    originCheck, // CSRF: SameSite=Lax'in üstüne ikinci savunma hattı
    createApiRouter(container),
  );

  // --- /ingest/v1/* — cihazlar --------------------------------------------
  // Gövde ayrıştırıcısı router'ın KENDİ içinde: /api/v1'in 100 KB limiti
  // buraya sızmasın.
  app.use(
    "/ingest/v1",
    createIngestRouter(
      container.controllers.ingest,
      container.repositories.deviceApiKeys,
      container.services.license
    ),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
