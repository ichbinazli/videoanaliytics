import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { env, isTest } from "../config/env.js";
import { TenantContextMissingError } from "../errors/httpErrors.js";
import { currentScope } from "./tenantContext.js";
import { logger } from "./logger.js";

/**
 * Tenant'a ait tablolar.
 *
 * Bu listedeki her modelin `tenantId` kolonu vardır ve aşağıdaki extension her
 * sorguya bu filtreyi MEKANİK olarak ekler. Yeni bir tenant tablosu eklendiğinde
 * buraya da eklenmesi ZORUNLUDUR.
 *
 * Listede olmayanlar ve sebepleri:
 *  - Tenant           : tenant'ın kendisi; SUPER_ADMIN yönetir (system scope).
 *  - RefreshToken     : tenantId taşımaz, userId üzerinden zaten kapalı.
 *  - RollupDirtyBucket: iç iş kuyruğu; sadece ingest ve job'lar dokunur.
 */
const TENANT_OWNED_MODELS = new Set([
  "User",
  "Site",
  "Device",
  "DeviceApiKey",
  "ViewerSession",
  "SessionRollupHourly",
  "DemographicRollupDaily",
]);

/** `where` klozuna tenantId eklenen okuma/toplu yazma işlemleri. */
const WHERE_SCOPED_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
  "update",
  "delete",
]);

/** `data` içine tenantId enjekte edilen işlemler. */
const DATA_SCOPED_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

type QueryArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

function withTenantId(
  value: Record<string, unknown> | undefined,
  tenantId: number,
): Record<string, unknown> {
  return { ...(value ?? {}), tenantId };
}

function createPrismaClient() {
  const adapter = new PrismaMariaDb(env.DATABASE_URL);

  return new PrismaClient({ adapter }).$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_OWNED_MODELS.has(model)) {
            return query(args);
          }

          const scope = currentScope();

          // Scope hiç açılmamış: bu bir programlama hatasıdır. Sessizce tüm
          // tenant'ların verisini döndürmektense sert biçimde patlıyoruz.
          if (!scope) {
            throw new TenantContextMissingError(model, operation);
          }

          if (scope.kind === "system") {
            return query(args);
          }

          const typedArgs = (args ?? {}) as QueryArgs;

          if (WHERE_SCOPED_OPERATIONS.has(operation)) {
            // findUnique/update/delete için de çalışır: Prisma'nın
            // extendedWhereUnique davranışı sayesinde WhereUniqueInput ek
            // (unique olmayan) filtreleri kabul eder. Böylece başka tenant'ın
            // id'siyle yapılan çağrı "bulunamadı" döner, o kaydı DÖNDÜRMEZ.
            typedArgs.where = withTenantId(typedArgs.where, scope.tenantId);
          }

          if (DATA_SCOPED_OPERATIONS.has(operation) && typedArgs.data !== undefined) {
            typedArgs.data = Array.isArray(typedArgs.data)
              ? typedArgs.data.map((row) => withTenantId(row, scope.tenantId))
              : withTenantId(typedArgs.data, scope.tenantId);
          }

          if (operation === "upsert") {
            typedArgs.where = withTenantId(typedArgs.where, scope.tenantId);
            typedArgs.create = withTenantId(typedArgs.create, scope.tenantId);
          }

          return query(typedArgs);
        },
      },
    },
  });
}

/**
 * Tek Prisma örneği.
 *
 * Her PrismaClient kendi bağlantı havuzunu açar; process başına tek örnek
 * kullanmak zorunludur. `globalThis` üzerinde saklıyoruz ki tsx watch yeniden
 * yüklediğinde havuzlar birikmesin.
 */
const globalForPrisma = globalThis as unknown as {
  __octoVaPrisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.__octoVaPrisma ?? createPrismaClient();

if (!isTest) {
  globalForPrisma.__octoVaPrisma = prisma;
}

export type ExtendedPrismaClient = typeof prisma;

/** Readiness probe'u için hafif bir bağlantı kontrolü. */
export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch (error) {
    logger.error({ err: error }, "Prisma bağlantısı kapatılamadı");
  }
}

/*
 * BİLİNEN SINIRLAR — extension'ın kapsamadığı iki yol:
 *
 *  1. İç içe yazmalar (`tenant.update({ data: { sites: { create: … } } })`)
 *     üst seviye işlem olarak görülmez, dolayısıyla tenantId enjekte edilmez.
 *     Repository katmanı bilinçli olarak düz create/update kullanır.
 *
 *  2. `$queryRaw` / `$executeRaw` extension'ı tamamen atlar. Ham SQL yazan her
 *     yer tenant filtresini ELLE eklemek zorundadır; rollup sorguları bunu
 *     yapar ve ilgili yerlerde yorumla işaretlenmiştir.
 */
