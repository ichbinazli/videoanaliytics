import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { env } from "../src/config/env.js";
import { floorToUtcHour } from "../src/utils/time.js";

/**
 * Panel geliştirme ve performans ölçümü için sentetik veri üretir.
 *
 *   npx tsx prisma/seed-demo-data.ts [gün] [cihaz] [günlük-oturum]
 *
 * Gerçekçi bir dağılım kullanır (gece sessiz, öğle ve akşam yoğun) — düz
 * rastgele veri, grafiklerin doğru çalıştığını göstermez.
 */

const adapter = new PrismaMariaDb(env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const DAYS = Number(process.argv[2] ?? 90);
const DEVICES_PER_SITE = Number(process.argv[3] ?? 2);
const SESSIONS_PER_DEVICE_DAY = Number(process.argv[4] ?? 400);

/** Saat başına göreli yoğunluk — 24 saatlik mağaza trafiği profili. */
const HOURLY_WEIGHT = [
  1, 1, 1, 1, 1, 2, 4, 8, 14, 20, 26, 32, 38, 36, 30, 28, 32, 40, 44, 38, 26, 14, 6, 2,
];

const GENDERS = ["MALE", "FEMALE", "UNKNOWN"] as const;
const EMOTIONS = ["HAPPY", "NEUTRAL", "SAD", "SURPRISE", "ANGRY", "UNKNOWN"] as const;

function weightedHour(): number {
  const total = HOURLY_WEIGHT.reduce((sum, weight) => sum + weight, 0);
  let target = Math.random() * total;

  for (let hour = 0; hour < 24; hour += 1) {
    target -= HOURLY_WEIGHT[hour]!;
    if (target <= 0) return hour;
  }
  return 12;
}

function ageBucketFor(age: number): "CHILD" | "YOUTH" | "ADULT" | "MIDDLE_AGED" | "SENIOR" {
  if (age < 12) return "CHILD";
  if (age < 25) return "YOUTH";
  if (age < 45) return "ADULT";
  if (age < 60) return "MIDDLE_AGED";
  return "SENIOR";
}

async function main(): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("Demo veri üreteci production'da çalıştırılamaz");
  }

  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { id: "asc" } });
  const sites = await prisma.site.findMany({ where: { tenantId: tenant.id } });

  if (sites.length === 0) {
    throw new Error("Önce `npm run db:seed` çalıştırın: mağaza bulunamadı.");
  }

  // Yeterli cihaz yoksa tamamla.
  for (const site of sites) {
    const existing = await prisma.device.count({ where: { siteId: site.id } });
    for (let index = existing; index < DEVICES_PER_SITE; index += 1) {
      await prisma.device.create({
        data: {
          tenantId: tenant.id,
          siteId: site.id,
          name: `${site.name} ekran ${index + 1}`,
          code: `${site.code}-EKRAN-${String(index + 1).padStart(2, "0")}`,
        },
      });
    }
  }

  const devices = await prisma.device.findMany({ where: { tenantId: tenant.id } });
  const total = DAYS * devices.length * SESSIONS_PER_DEVICE_DAY;

  process.stdout.write(
    `${devices.length} cihaz x ${DAYS} gün x ${SESSIONS_PER_DEVICE_DAY} oturum = ` +
      `${total.toLocaleString("tr-TR")} satır üretiliyor...\n`,
  );

  const dirtyBuckets = new Set<string>();
  const startedAtBase = Date.now() - DAYS * 24 * 60 * 60 * 1000;
  let written = 0;

  for (const device of devices) {
    for (let day = 0; day < DAYS; day += 1) {
      const rows = [];

      for (let index = 0; index < SESSIONS_PER_DEVICE_DAY; index += 1) {
        const dayStart = new Date(startedAtBase + day * 24 * 60 * 60 * 1000);
        dayStart.setUTCHours(weightedHour(), Math.floor(Math.random() * 60), 0, 0);

        const passed = 1 + Math.floor(Math.random() * 4);
        const looked = Math.floor(Math.random() * (passed + 1));
        const age = 8 + Math.floor(Math.random() * 62);
        const duration = 3 + Math.floor(Math.random() * 60);

        rows.push({
          sessionUuid: randomUUID(),
          tenantId: tenant.id,
          siteId: device.siteId,
          deviceId: device.id,
          startedAt: dayStart,
          endedAt: new Date(dayStart.getTime() + duration * 1000),
          durationSec: duration,
          personsPassed: passed,
          personsLooked: looked,
          lookingSeconds: Math.round(looked * Math.random() * 20 * 10) / 10,
          ageEstimate: age,
          ageBucket: ageBucketFor(age),
          gender: GENDERS[Math.floor(Math.random() * GENDERS.length)]!,
          emotion: EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)]!,
        });

        dirtyBuckets.add(`${device.id}|${floorToUtcHour(dayStart).toISOString()}`);
      }

      await prisma.viewerSession.createMany({ data: rows, skipDuplicates: true });
      written += rows.length;

      if (written % 20_000 === 0) {
        process.stdout.write(`  ${written.toLocaleString("tr-TR")} satır...\n`);
      }
    }
  }

  process.stdout.write(`${dirtyBuckets.size} saat kovası işaretleniyor...\n`);

  const bucketRows = [...dirtyBuckets].map((key) => {
    const [deviceId, iso] = key.split("|");
    return { deviceId: Number(deviceId), bucketStart: new Date(iso!) };
  });

  for (let index = 0; index < bucketRows.length; index += 5_000) {
    await prisma.rollupDirtyBucket.createMany({
      data: bucketRows.slice(index, index + 5_000),
      skipDuplicates: true,
    });
  }

  process.stdout.write(
    `\nTamam: ${written.toLocaleString("tr-TR")} oturum, ${dirtyBuckets.size} kova kuyrukta.\n` +
      `Rollup'ları üretmek için: npx tsx prisma/run-rollup.ts\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Demo veri üretimi başarısız: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
