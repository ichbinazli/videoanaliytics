# Mimari

## Genel akış

```
┌──────────────┐   HTTPS batch   ┌───────────────────────────┐   SQL   ┌─────────┐
│ apps/kiosk   │ ──────────────▶ │ apps/api                  │ ──────▶ │  MySQL  │
│ (Python)     │  X-Api-Key      │  /ingest/v1/*  (cihaz)    │         │         │
│              │                 │  /api/v1/*     (kullanıcı)│ ◀────── │         │
│ spool.db     │                 └───────────────────────────┘         └─────────┘
│ (offline     │                              ▲                             ▲
│  kuyruk)     │                              │ httpOnly cookie             │
└──────────────┘                   ┌──────────┴──────────┐         ┌────────┴────────┐
                                   │ apps/panel (Next.js)│         │ rollup job      │
                                   └─────────────────────┘         │ (node-cron)     │
                                                                   └─────────────────┘
```

Kiosk oturumu bittiğinde metrikleri **önce lokal spool'a** yazar; ayrı bir worker
thread bunları batch hâlinde API'ye gönderir. Böylece ağ kesintisi kiosk'u
etkilemez ve video thread'i asla ağ beklemez.

## Neden tek Express servisi, iki modül

`/ingest/*` ve `/api/*` aynı process içinde ama **ayrı middleware zincirleri** ile
çalışır — iki farklı güvenlik modeli oldukları için:

| | `/ingest/v1/*` | `/api/v1/*` |
|---|---|---|
| Kimlik | Cihaz API key (`X-Api-Key`) | Kullanıcı JWT (httpOnly cookie) |
| Yön | Sadece yazma | Ağırlıklı okuma |
| CORS | Kapalı | Panel origin'i |
| Rate limit | Cihaz başına | Kullanıcı başına |
| Tenant kaynağı | API key'in sahibi cihaz | JWT claim'i |

Tek Prisma client, tek migration seti, tek deploy. Hacim gerektirirse ingest'i
ayrı process'e çıkarmak router'ı taşımaktan ibaret.

## Katmanlar (apps/api)

```
routes → controller → service → repository → Prisma → MySQL
           (HTTP)     (kural)    (tek SQL noktası)
```

- **Controller** sadece HTTP bilir: DTO parse edilmiş gelir, servis çağrılır, yanıt yazılır.
- **Service** iş kuralını bilir, HTTP bilmez — test edilirken sahte repository verilir.
- **Repository**, Prisma'ya dokunan **tek** katmandır. Amacı DB değiştirebilmek
  değil; tenant scope'unun ve sayfalamanın tek geçiş noktası olmasıdır.

Hata yanıtını formatlayan tek yer `errorHandler.middleware.ts`; her yerden
`throw new NotFoundError()` yazılır.

## Tenant izolasyonu

Dört katman, biri mekanik:

1. `jwtAuth` → `req.auth.tenantId` **token'dan** gelir, istekten asla.
2. `tenantScope` → `AsyncLocalStorage` üzerinde `runAsTenant(tenantId)` açar.
3. **Prisma guard extension** → tenant-sahipli her modelin sorgusuna `tenantId`
   enjekte eder; scope yoksa hata fırlatır. Unutulmuş bir `where` veri sızıntısı
   değil, 500 üretir.
4. `tests/integration/tenant-isolation.spec.ts` → her route, A tenant'ının
   cookie'siyle B tenant'ının id'lerine çağrıldığında 404 döndürmek zorunda.

`runAsSystem()` tek kaçış yoludur ve yalnızca dört yerde kullanılır: ingest
(hemen ardından cihazın tenant'ına geçer), rollup/purge job'ları, login'deki
e-posta araması ve SUPER_ADMIN tenant yönetimi.

## Agregasyon

Ingest ham `ViewerSession` satırlarını yazar ve etkilenen saat kovalarını
`RollupDirtyBucket`'a işaretler. Cron worker'ı yalnızca o kovaları **yeniden
hesaplayıp** upsert eder.

Ingest sırasında sayaç artırmamanın iki sebebi var: increment retry altında
idempotent değildir, ve tüm cihazları tek bir sıcak satırda serileştirir.
Yeniden hesaplama ise istendiği kadar çalıştırılabilir ve geriye dönük
düzeltmeye (backfill) izin verir.

## Zaman ve saat kayması

Her oturum iki zaman damgası taşır: `startedAt` (cihaz saati) ve `receivedAt`
(sunucu saati). Kiosk saatleri kayabildiği için ingest bir pencere uygular
(varsayılan: 48 saat gelecek / 90 gün geçmiş). Pencere dışındaki kayıt batch'i
düşürmez — `rejected` listesiyle raporlanır, böylece tek bozuk satır kuyruğu
tıkamaz.
