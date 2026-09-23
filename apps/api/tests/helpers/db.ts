import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { env } from "../../src/config/env.js";
import { hashPassword } from "../../src/security/password.js";
import { generateApiKey } from "../../src/security/apiKey.js";

/**
 * Testlerde SARMALANMAMIŞ Prisma client'ı kullanılır.
 *
 * Bu kasıtlı: test verisini kurarken guard'ın kendisine güvenmek, guard'ı
 * guard ile test etmek olurdu. Kurulum ham client ile yapılır, doğrulama ise
 * gerçek HTTP istekleriyle — yani uygulamanın kullandığı sarmalanmış client
 * üzerinden.
 */
const adapter = new PrismaMariaDb(env.DATABASE_URL);
export const rawPrisma = new PrismaClient({ adapter });

export const TEST_PASSWORD = "TestSifre123";

/**
 * Tabloları çocuktan ebeveyne doğru boşaltır.
 *
 * TRUNCATE + `SET FOREIGN_KEY_CHECKS=0` yerine DELETE kullanılıyor: o oturum
 * değişkeni bağlantıya özeldir ve Prisma'nın havuzu her sorguyu farklı bir
 * bağlantıya verebildiği için ayarın etkisi güvenilmez. Doğru sırayla DELETE
 * hiçbir numaraya ihtiyaç duymaz.
 */
const TABLES_CHILD_FIRST = [
  "viewer_sessions",
  "session_rollup_hourly",
  "demographic_rollup_daily",
  "rollup_dirty_buckets",
  "device_api_keys",
  "devices",
  "sites",
  "refresh_tokens",
  "users",
  "tenants",
] as const;

export async function truncateAll(): Promise<void> {
  for (const table of TABLES_CHILD_FIRST) {
    await rawPrisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
  }
}

export type SeededTenant = {
  tenantId: number;
  siteId: number;
  deviceId: number;
  adminEmail: string;
  viewerEmail: string;
  apiKey: string;
};

/** Tam donanımlı, birbirinden bağımsız bir müşteri kurar. */
export async function seedTenant(slug: string): Promise<SeededTenant> {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const tenant = await rawPrisma.tenant.create({
    data: { name: `${slug} A.Ş.`, slug },
  });

  await rawPrisma.user.create({
    data: {
      email: `admin@${slug}.test`,
      fullName: `${slug} yönetici`,
      passwordHash,
      role: "TENANT_ADMIN",
      tenantId: tenant.id,
    },
  });

  await rawPrisma.user.create({
    data: {
      email: `viewer@${slug}.test`,
      fullName: `${slug} izleyici`,
      passwordHash,
      role: "TENANT_VIEWER",
      tenantId: tenant.id,
    },
  });

  const site = await rawPrisma.site.create({
    data: { tenantId: tenant.id, name: `${slug} mağaza`, code: `${slug}-01` },
  });

  const device = await rawPrisma.device.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      name: `${slug} ekran`,
      code: `${slug}-EKRAN-01`,
    },
  });

  const key = generateApiKey();
  await rawPrisma.deviceApiKey.create({
    data: {
      tenantId: tenant.id,
      deviceId: device.id,
      keyPrefix: key.prefix,
      keyHash: key.hash,
    },
  });

  return {
    tenantId: tenant.id,
    siteId: site.id,
    deviceId: device.id,
    adminEmail: `admin@${slug}.test`,
    viewerEmail: `viewer@${slug}.test`,
    apiKey: key.plaintext,
  };
}

export async function seedSuperAdmin(email = "super@octopus.test"): Promise<number> {
  const user = await rawPrisma.user.create({
    data: {
      email,
      fullName: "Platform yöneticisi",
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: "SUPER_ADMIN",
      tenantId: null,
    },
  });
  return user.id;
}
