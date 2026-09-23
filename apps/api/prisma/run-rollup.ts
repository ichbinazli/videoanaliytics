import { buildContainer } from "../src/container.js";
import { disconnectPrisma } from "../src/infra/prisma.js";

/**
 * Rollup job'ını cron beklemeden elle çalıştırır.
 *
 *   npx tsx prisma/run-rollup.ts
 *
 * Kullanım yerleri: demo veri ürettikten sonra, bir hata düzeltmesinin ardından
 * geriye dönük düzeltme (backfill), ve geliştirirken hızlı geri bildirim.
 * İş idempotent olduğu için istenildiği kadar çalıştırılabilir.
 */
const container = buildContainer();

const startedAt = Date.now();
const result = await container.jobs.rollup.run();

process.stdout.write(
  `Rollup tamamlandı: ${result.processed} kova hesaplandı, ` +
    `${result.cleared} kuyruktan silindi, ${Date.now() - startedAt} ms.\n`,
);

await disconnectPrisma();
