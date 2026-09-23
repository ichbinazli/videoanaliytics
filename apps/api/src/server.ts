import { createApp } from "./app.js";
import { buildContainer } from "./container.js";
import { startScheduler } from "./jobs/scheduler.js";
import { env } from "./config/env.js";
import { logger } from "./infra/logger.js";
import { disconnectPrisma } from "./infra/prisma.js";

/**
 * Process'in tek sorumluluğu: portu aç, sinyalleri dinle, düzgün kapan.
 * Uygulama kurulumunun tamamı app.ts içindedir.
 */

const container = buildContainer();
const app = createApp(container);
const scheduledTasks = startScheduler(container.jobs);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "API ayakta");
});

/** Kapanış: yeni bağlantı alma, açık istekleri bitir, DB havuzunu kapat. */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "kapanış başladı");

  // Yeni bir job turu başlamasın; süren tur kendi içinde bitecek.
  for (const task of scheduledTasks) task.stop();

  // Açık istekler bitmezse süreci yine de bırakma: orchestrator'ın SIGKILL'ini
  // beklemek yerine kendimiz çıkıyoruz.
  const forceExit = setTimeout(() => {
    logger.warn("açık istekler zamanında bitmedi, zorla çıkılıyor");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    await disconnectPrisma();
    clearTimeout(forceExit);
    logger.info("kapanış tamamlandı");
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Yakalanmamış hata = bilinmeyen durum. Loglayıp çıkıyoruz; orchestrator
// yeniden başlatsın. Bozuk state ile devam etmek daha tehlikeli.
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "yakalanmamış istisna");
  void shutdown("uncaughtException").finally(() => process.exit(1));
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "işlenmemiş promise reddi");
  void shutdown("unhandledRejection").finally(() => process.exit(1));
});
