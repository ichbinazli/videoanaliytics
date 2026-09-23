import { AsyncLocalStorage } from "node:async_hooks";

/**
 * İsteğin hangi tenant adına çalıştığını taşıyan bağlam.
 *
 * Neden AsyncLocalStorage? Alternatif, tenantId'yi controller'dan service'e,
 * service'ten repository'ye elden ele geçirmekti. Tek bir yerde unutulması
 * tenant'lar arası veri sızıntısı demek. ALS ile scope isteğin kökünde bir kez
 * açılır ve Prisma extension'ı (infra/prisma.ts) her sorguda mekanik olarak
 * okur — kimsenin bir şey hatırlamasına gerek kalmaz.
 */

export type TenantScope =
  /** Normal istek: tüm sorgular bu tenantId ile sınırlanır. */
  | { kind: "tenant"; tenantId: number }
  /**
   * Bilinçli kaçış yolu: sorgular tenant filtresi olmadan çalışır.
   * Sadece dört yerde kullanılır — ingest (hemen ardından cihazın tenant'ına
   * geçer), rollup/purge job'ları, login'deki e-posta araması ve SUPER_ADMIN
   * tenant yönetimi.
   */
  | { kind: "system"; reason: string };

const storage = new AsyncLocalStorage<TenantScope>();

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

function runInScope<T>(scope: TenantScope, fn: () => T): T {
  return storage.run(scope, () => {
    const result = fn();

    // DİKKAT — buradaki `await` şart:
    // Prisma sorguları TEMBEL'dir. `prisma.site.findMany()` hemen çalışmaz,
    // yalnızca bir PrismaPromise döndürür; asıl sorgu `.then()` çağrıldığında
    // başlar. Callback senkron olarak bu promise'i döndürürse `.then()` scope
    // KAPANDIKTAN sonra çağrılır ve extension tenant'ı göremez.
    //
    // Thenable'ı burada, scope hâlâ açıkken await ederek `.then()` çağrısının
    // doğru bağlam içinde yapılmasını garantiliyoruz.
    if (isThenable(result)) {
      return (async () => await result)() as T;
    }

    return result;
  });
}

/** Verilen tenant'a kilitlenmiş bir scope içinde çalıştırır. */
export function runAsTenant<T>(tenantId: number, fn: () => T): T {
  return runInScope({ kind: "tenant", tenantId }, fn);
}

/**
 * Tenant filtresi olmadan çalıştırır.
 *
 * `reason` zorunlu: bu fonksiyonun her kullanımı kod incelemesinde gerekçesiyle
 * birlikte görünsün diye. Kullanım yerleri greplenebilir olmalıdır.
 */
export function runAsSystem<T>(reason: string, fn: () => T): T {
  return runInScope({ kind: "system", reason }, fn);
}

/** Aktif scope; hiç açılmamışsa undefined. */
export function currentScope(): TenantScope | undefined {
  return storage.getStore();
}

/** Aktif tenantId; system scope'unda veya scope yokken undefined. */
export function currentTenantId(): number | undefined {
  const scope = storage.getStore();
  return scope?.kind === "tenant" ? scope.tenantId : undefined;
}

/**
 * Yeni kayıt oluştururken kullanılır.
 *
 * Neden gerekli: guard extension'ı `create` çağrılarına tenantId'yi çalışma
 * zamanında enjekte ediyor, ama TypeScript bunu göremediği için Prisma'nın
 * CreateInput tipi alanı zorunlu görüyor. Değeri burada açıkça okuyup vermek,
 * tip güvenliğini `as any` ile kırmadan koruyor. Extension yine de yerinde
 * duruyor — o, unutulan `where` klozları için ikinci savunma hattı.
 */
export function requireTenantId(context: string): number {
  const tenantId = currentTenantId();

  if (tenantId === undefined) {
    throw new Error(
      `${context}: tenant scope'u açık değil. Kayıt oluşturma runAsTenant() içinde yapılmalı.`,
    );
  }

  return tenantId;
}
