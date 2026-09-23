import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/security/password.js";
import { generateApiKey } from "../src/security/apiKey.js";

/**
 * Geliştirme ortamı için asgari, GERÇEKÇİ bir başlangıç verisi.
 *
 * Bilinçli olarak sarmalanmamış (extension'sız) PrismaClient kullanır: seed
 * tanımı gereği tenant sınırlarının üstünde çalışır ve tenant'ların kendisini
 * oluşturur.
 *
 * Idempotent'tir — tekrar tekrar çalıştırılabilir. Tek istisna cihaz API
 * key'idir: hash'i saklandığı için düz metni geri üretilemez, bu yüzden key'i
 * olmayan cihaza her çalıştırmada yeni bir key basılır.
 */

const adapter = new PrismaMariaDb(env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = "Octopus123!";

async function main(): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("seed production ortamında çalıştırılamaz");
  }

  const passwordHash = await hashPassword(DEV_PASSWORD);

  // --- Platform yöneticisi (tenant'a bağlı değil) --------------------------
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@octopus.tv" },
    update: {},
    create: {
      email: "admin@octopus.tv",
      fullName: "Octopus Platform Yöneticisi",
      passwordHash,
      role: "SUPER_ADMIN",
      tenantId: null,
    },
  });

  // --- Demo müşteri --------------------------------------------------------
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-perakende" },
    update: {},
    create: {
      name: "Demo Perakende A.Ş.",
      slug: "demo-perakende",
      timezone: "Europe/Istanbul",
    },
  });

  await prisma.user.upsert({
    where: { email: "yonetici@demo.com" },
    update: {},
    create: {
      email: "yonetici@demo.com",
      fullName: "Demo Yönetici",
      passwordHash,
      role: "TENANT_ADMIN",
      tenantId: tenant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "izleyici@demo.com" },
    update: {},
    create: {
      email: "izleyici@demo.com",
      fullName: "Demo İzleyici",
      passwordHash,
      role: "TENANT_VIEWER",
      tenantId: tenant.id,
    },
  });

  // --- Demo lisans -----------------------------------------------------------
  await prisma.license.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      status: "ACTIVE",
      plan: "pro",
      maxDevices: 10,
      startsAt: new Date(),
    },
  });

  // --- Mağaza ve ekran -----------------------------------------------------
  const site = await prisma.site.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "IST-KADIKOY" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Kadıköy Mağaza",
      code: "IST-KADIKOY",
      city: "İstanbul",
    },
  });

  const device = await prisma.device.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "KDK-VITRIN-01" } },
    update: {},
    create: {
      tenantId: tenant.id,
      siteId: site.id,
      name: "Kadıköy Vitrin Ekranı",
      code: "KDK-VITRIN-01",
      screenLabel: "Vitrin — sol",
    },
  });

  // --- Cihaz API key'i -----------------------------------------------------
  const existingKey = await prisma.deviceApiKey.findFirst({
    where: { deviceId: device.id, status: "ACTIVE" },
  });

  let printedKey: string | undefined;

  if (!existingKey) {
    const generated = generateApiKey();
    await prisma.deviceApiKey.create({
      data: {
        tenantId: tenant.id,
        deviceId: device.id,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
        label: "seed ile üretildi",
        createdById: superAdmin.id,
      },
    });
    printedKey = generated.plaintext;
  }

  // --- Özet ----------------------------------------------------------------
  const line = "-".repeat(72);
  const out = [
    "",
    line,
    "  Seed tamamlandı",
    line,
    `  Müşteri (tenant) : ${tenant.name} (#${tenant.id})`,
    `  Mağaza           : ${site.name} (${site.code})`,
    `  Cihaz            : ${device.name} (${device.code})`,
    "",
    "  Kullanıcılar (hepsinin şifresi aynı):",
    `    SUPER_ADMIN   admin@octopus.tv`,
    `    TENANT_ADMIN  yonetici@demo.com`,
    `    TENANT_VIEWER izleyici@demo.com`,
    `    Şifre         ${DEV_PASSWORD}`,
    "",
    printedKey
      ? `  Cihaz API key'i (BİR KEZ gösterilir):\n    ${printedKey}\n\n` +
        `    export VA_TELEMETRY_API_KEY=${printedKey}`
      : "  Cihazın zaten aktif bir API key'i var. Yenisi için panelden key üretin\n" +
        "  ya da mevcut key'i iptal edip seed'i tekrar çalıştırın.",
    line,
    "",
  ].join("\n");

  process.stdout.write(`${out}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Seed başarısız: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
