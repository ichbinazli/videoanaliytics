# Octopus Video Analytics

Ekran önü kitle ölçümü platformu: kiosk cihazı anonim izleyici metriklerini üretir,
veri toplama API'si bunları müşteri (tenant) bazlı saklar, panel de müşterinin
kendi ekranlarının performansını görmesini sağlar.

## Depo yapısı

| Klasör | Ne | Stack |
|---|---|---|
| [`apps/kiosk`](apps/kiosk) | Mağaza içi akıllı ayna / kiosk uygulaması. Kitleyi anonim tespit eder, oturum metriklerini üretir ve API'ye gönderir. | Python 3.10+, PyQt6, OpenCV, MediaPipe, YOLOv8, DeepFace |
| [`apps/api`](apps/api) | Tek Express servisi, iki modül: `/ingest/*` (cihaz API-key ile veri toplama) ve `/api/*` (kullanıcı JWT ile panel sorguları). | Node.js 22, Express, TypeScript, Prisma, MySQL |
| [`apps/panel`](apps/panel) | Müşteri paneli: KPI'lar, zaman serileri, demografi kırılımları, cihaz ve kullanıcı yönetimi. | Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Recharts |

Mimari ve veri modeli notları [`docs/`](docs) altında; cihazların uyduğu wire
kontratı [`docs/ingest-contract.md`](docs/ingest-contract.md) içinde.

## Geliştirme ortamı

Gereksinimler: Node.js 22+, Python 3.10–3.12, Docker.

```bash
# 1. Veritabanı
docker compose up -d              # MySQL :3307, Adminer :8080

# 2. Bağımlılıklar
npm install                       # apps/api + apps/panel (npm workspaces)

# 3. Ortam dosyaları
cp apps/api/.env.example apps/api/.env       # JWT_ACCESS_SECRET ve API_KEY_PEPPER üretin:
                                             #   openssl rand -base64 48
cp apps/panel/.env.example apps/panel/.env.local

# 4. Şema ve örnek veri
npm run db:migrate
npm run db:seed                   # bir cihaz API key'i basar, kopyalayın

# 5. Servisler (ayrı terminallerde)
npm run dev:api                   # http://localhost:4000
npm run dev:panel                 # http://localhost:3000
```

Panele `yonetici@demo.com` / `Octopus123!` ile girebilirsiniz.

Grafikleri gerçekçi veriyle görmek isterseniz:

```bash
npm -w @octo-va/api run db:demo    # sentetik oturumlar (gün, cihaz, günlük oturum)
npm -w @octo-va/api run db:rollup  # agregatları hesapla (cron'u beklemeden)
```

Kiosk ayrı bir Python ortamında çalışır:

```bash
cd apps/kiosk
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -e .
export VA_TELEMETRY_API_KEY=<db:seed'in bastığı key>
python -m video_analytics.main
```

## Testler

API integration testleri ayrı bir veritabanına yazar; şeması bir kez kurulur:

```bash
DATABASE_URL="mysql://va:va@localhost:3307/video_analytics_test" \
  npm -w @octo-va/api exec prisma migrate deploy
```

```bash
npm test                          # API: unit + integration
npm run test:kiosk                # Kiosk: pytest
npm run typecheck                 # api + panel
```

## Cihaz bağlama

1. Panelde **Cihazlar → Yeni cihaz** ile ekranı tanıtın.
2. Cihaz detayında **Yeni key üret** deyin; key **yalnızca bir kez** gösterilir.
3. Kiosk makinesinde:

```bash
export VA_TELEMETRY_API_KEY=vak_...
```

4. `apps/kiosk/config.yaml` içindeki `telemetry:` bloğunu açın ve `base_url`
   değerini API adresine ayarlayın.

Kiosk internetsizken veriyi yerel kuyrukta biriktirir, bağlantı gelince
gönderir; aynı oturumun iki kez sayılması sunucu tarafında engellenir.
Kontrat ayrıntısı: [`docs/ingest-contract.md`](docs/ingest-contract.md)

<img width="1280" height="574" alt="1789573284268" src="https://github.com/user-attachments/assets/fcb909ff-6cef-4585-8900-5f529a8285e8" />
<img width="1280" height="468" alt="1789573284459" src="https://github.com/user-attachments/assets/c9f1ee3e-bd23-4d8f-b5c8-e07cd5d1c8d7" />
