import { Router } from "express";
import type { Container } from "../container.js";
import { jwtAuth } from "../middleware/jwtAuth.middleware.js";
import { tenantScope } from "../middleware/tenantScope.middleware.js";
import { apiRateLimit } from "../middleware/rateLimit.middleware.js";
import { createAuthRouter } from "../modules/auth/auth.routes.js";
import { createSiteRouter } from "../modules/site/site.routes.js";
import { createDeviceRouter } from "../modules/device/device.routes.js";
import { createUserRouter } from "../modules/user/user.routes.js";
import { createTenantRouter } from "../modules/tenant/tenant.routes.js";
import { createAnalyticsRouter } from "../modules/analytics/analytics.routes.js";
import { createSessionRouter } from "../modules/session/session.routes.js";
import { createLicenseRouter } from "../modules/license/license.routes.js";

/**
 * Panel API'si — kullanıcı JWT'si ile.
 *
 * Zincirin sırası önemli ve okunmak için yazıldı:
 *
 *   /auth/*        -> kendi içinde; tenant scope'u YOK (login sırasında tenant
 *                     henüz bilinmiyor)
 *   diğer her şey  -> jwtAuth (kimsin?) -> tenantScope (kimin verisi?) -> rota
 *
 * jwtAuth ile tenantScope'un ayrı olması kasıtlı: biri kimlik, diğeri kapsam.
 * Birleştirilmiş tek bir middleware, ikisinden birini değiştirmeyi tehlikeli
 * hâle getirirdi.
 */
export function createApiRouter(container: Container): Router {
  const router = Router();

  router.use("/auth", createAuthRouter(container.controllers.auth));

  // Buradan sonrası oturum ister.
  router.use(jwtAuth, apiRateLimit, tenantScope);

  router.use("/tenants", createTenantRouter(container.repositories.tenants));
  router.use("/users", createUserRouter(container.controllers.users));
  router.use("/sites", createSiteRouter(container.controllers.sites));
  router.use("/devices", createDeviceRouter(container.controllers.devices));
  router.use("/sessions", createSessionRouter(container.repositories.viewerSessions));
  router.use("/analytics", createAnalyticsRouter(container.controllers.analytics));
  router.use("/licenses", createLicenseRouter(container.services.license));

  return router;
}

