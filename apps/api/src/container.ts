import { prisma, type ExtendedPrismaClient } from "./infra/prisma.js";

import { DeviceApiKeyRepository } from "./repositories/deviceApiKey.repository.js";
import { DirtyBucketRepository } from "./repositories/dirtyBucket.repository.js";
import { RollupRepository } from "./repositories/rollup.repository.js";
import { DeviceRepository } from "./repositories/device.repository.js";
import { RefreshTokenRepository } from "./repositories/refreshToken.repository.js";
import { SiteRepository } from "./repositories/site.repository.js";
import { TenantRepository } from "./repositories/tenant.repository.js";
import { UserRepository } from "./repositories/user.repository.js";
import { ViewerSessionRepository } from "./repositories/viewerSession.repository.js";
import { LicenseRepository } from "./repositories/license.repository.js";

import { AuthService } from "./modules/auth/auth.service.js";
import { LicenseService } from "./modules/license/license.service.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { DeviceService } from "./modules/device/device.service.js";
import { DeviceController } from "./modules/device/device.controller.js";
import { SiteService } from "./modules/site/site.service.js";
import { SiteController } from "./modules/site/site.controller.js";
import { UserService } from "./modules/user/user.service.js";
import { UserController } from "./modules/user/user.controller.js";
import { IngestService } from "./modules/ingest/ingest.service.js";
import { IngestController } from "./modules/ingest/ingest.controller.js";
import { AnalyticsService } from "./modules/analytics/analytics.service.js";
import { AnalyticsController } from "./modules/analytics/analytics.controller.js";
import { RollupJob } from "./jobs/rollup.job.js";
import { RetentionJob } from "./jobs/retention.job.js";

/**
 * Composition root — bağımlılıkların birbirine bağlandığı TEK yer.
 *
 * Bilinçli olarak elle yazıldı; awilix/tsyringe gibi bir DI kütüphanesi bu
 * boyutta bir uygulamada kazandırdığından fazlasını (dekoratör, metadata,
 * "sihirli" çözümleme) götürürdü. Buradaki 40 satır, Python'dan gelen bir
 * stajyerin de tek bakışta okuyabileceği düz kod.
 *
 * Kazanç somut: servisler kendi bağımlılıklarını kendileri yaratmadığı için
 * birim testlerinde sahte repository verilebiliyor.
 */
export type Container = ReturnType<typeof buildContainer>;

export function buildContainer(client: ExtendedPrismaClient = prisma) {
  // --- Repository katmanı (Prisma'ya dokunan tek yer) ---------------------
  const repositories = {
    tenants: new TenantRepository(client),
    users: new UserRepository(client),
    refreshTokens: new RefreshTokenRepository(client),
    sites: new SiteRepository(client),
    devices: new DeviceRepository(client),
    deviceApiKeys: new DeviceApiKeyRepository(client),
    viewerSessions: new ViewerSessionRepository(client),
    dirtyBuckets: new DirtyBucketRepository(client),
    rollups: new RollupRepository(client),
    licenses: new LicenseRepository(client),
  };

  // --- Servis katmanı (iş kuralları, HTTP'den habersiz) -------------------
  const services = {
    auth: new AuthService(
      repositories.users,
      repositories.refreshTokens,
      repositories.tenants,
    ),
    users: new UserService(repositories.users, repositories.refreshTokens),
    sites: new SiteService(repositories.sites),
    devices: new DeviceService(
      repositories.devices,
      repositories.deviceApiKeys,
      repositories.sites,
    ),
    ingest: new IngestService(
      repositories.viewerSessions,
      repositories.dirtyBuckets,
      repositories.devices,
    ),
    analytics: new AnalyticsService(
      repositories.rollups,
      repositories.viewerSessions,
      repositories.devices,
      repositories.tenants,
    ),
    license: new LicenseService(
      repositories.licenses,
      repositories.tenants,
    ),
  };

  // --- Controller katmanı (yalnızca HTTP) --------------------------------
  const controllers = {
    auth: new AuthController(services.auth, repositories.users),
    users: new UserController(services.users),
    sites: new SiteController(services.sites),
    devices: new DeviceController(services.devices),
    ingest: new IngestController(services.ingest),
    analytics: new AnalyticsController(services.analytics),
  };

  // --- Zamanlanmış işler --------------------------------------------------
  // Cron'a bağlanmadan da çağrılabilsinler diye burada kuruluyorlar: testler ve
  // elle backfill doğrudan job.run() diyebiliyor.
  const jobs = {
    rollup: new RollupJob(
      repositories.dirtyBuckets,
      repositories.rollups,
      repositories.tenants,
    ),
    retention: new RetentionJob(repositories.tenants, repositories.refreshTokens),
  };

  return { repositories, services, controllers, jobs };
}

