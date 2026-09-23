import cron, { type ScheduledTask } from "node-cron";
import { env, isTest } from "../config/env.js";
import { logger } from "../infra/logger.js";
import type { RetentionJob } from "./retention.job.js";
import type { RollupJob } from "./rollup.job.js";

/**
 * Zamanlanmış işlerin kaydedildiği TEK yer.
 *
 * Kurulum ve zamanlama burada; işin kendisi kendi dosyasında. Böylece bir iş
 * cron olmadan da (test, elle backfill) çalıştırılabiliyor.
 *
 * NOT: Bu şu an in-process çalışıyor. API birden fazla kopyaya çıkarıldığında
 * job'lar tek bir kopyada koşmalı (ayrı bir worker process ya da dağıtık kilit).
 * Rollup idempotent olduğu için iki kopyanın aynı anda koşması YANLIŞ sonuç
 * vermez, sadece boşuna yük olur — ama retention için aynı şey geçerli değil.
 */
export function startScheduler(jobs: {
  rollup: RollupJob;
  retention: RetentionJob;
}): ScheduledTask[] {
  if (isTest) return [];

  const tasks: ScheduledTask[] = [];

  tasks.push(
    cron.schedule(env.ROLLUP_CRON, () => {
      void jobs.rollup.run().catch((error: unknown) => {
        logger.error({ err: error }, "rollup job başarısız");
      });
    }),
  );

  // Retention gece 03:15'te: yoğun saatlerin dışında ve büyük silme işlemleri
  // gündüz trafiğiyle çakışmasın.
  tasks.push(
    cron.schedule("15 3 * * *", () => {
      void jobs.retention.run().catch((error: unknown) => {
        logger.error({ err: error }, "retention job başarısız");
      });
    }),
  );

  logger.info({ rollupCron: env.ROLLUP_CRON }, "zamanlanmış işler başlatıldı");
  return tasks;
}
