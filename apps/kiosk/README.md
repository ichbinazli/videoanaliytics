# Video Analitik — Akıllı Ayna Sistemi

Mağaza içi akıllı ayna / kiosk için gerçek zamanlı video analitik uygulaması.

## Gereksinimler

| Bileşen | Sürüm |
|---------|-------|
| Python  | 3.10 – 3.12 |
| pip     | ≥ 22.0 |
| OS      | Windows 10/11 (test edildi) |

> **Not:** TensorFlow ve MediaPipe, Python 3.13+ sürümlerinde henüz tam destek sunmamaktadır.
> Lütfen Python 3.10 – 3.12 aralığında kalın.

## Kurulum

```bash
# 1. Sanal ortam oluştur ve aktif et
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# 2. Runtime bağımlılıklarını kur
pip install -r requirements.txt

# 3. (Opsiyonel) Geliştirme araçlarını da kur
pip install -r requirements-dev.txt

# 4. Paketi geliştirilebilir (editable) modda kur
pip install -e .
```

## Çalıştırma

Kurulum sonrasında uygulamayı **modül** olarak veya kurulumla oluşan **konsol komutları (entry points)** ile çalıştırabilirsiniz:

```bash
# Modül olarak çalıştırma
python -m video_analytics.main

# Konsol komutu (entry point) ile çalıştırma
video-analytics

# Modül olarak demo modunda çalıştırma (örnek ürünlerle)
python -m video_analytics.main --demo

# Konsol komutu ile demo modunda çalıştırma
video-analytics --demo

# Watchdog servisini modül olarak çalıştırma (çökerse otomatik yeniden başlatır)
python -m video_analytics.watchdog

# Watchdog servisini konsol komutu ile çalıştırma
video-analytics-watchdog
```

## Proje Yapısı

```
video-analytics/
├── config.yaml             # Uygulama ayarları
├── requirements.txt        # Runtime bağımlılıkları (pinned)
├── requirements-dev.txt    # Geliştirme bağımlılıkları
├── pyproject.toml          # Python sürümü & araç ayarları
├── README.md               # Dokümantasyon
└── src/
    └── video_analytics/    # Paket kök dizini
        ├── main.py         # Ana giriş noktası
        ├── watchdog.py     # Otomatik yeniden başlatma servisi
        ├── ai/             # Yapay zeka modülleri
        ├── core/           # Çekirdek altyapı
        ├── catalog/        # Ürün veritabanı
        └── ui/             # Arayüz
```

## Geliştirme ve Test

Geliştirme bağımlılıklarını kurduktan (`pip install -r requirements-dev.txt`) sonra testleri ve kalite araçlarını çalıştırabilirsiniz:

```bash
# Kod formatlama
black .

# Lint kontrolü
ruff check .

# Statik tip kontrolü (manuel)
mypy .

# Otomatik testleri (pytest) çalıştır
python -m pytest
```

> **Not:** Birim testler (unit tests) MediaPipe ve DeepFace gibi ağır bağımlılıkları mock'layarak izole eder; dolayısıyla çalışmak için kameraya veya indirilecek AI modellerine ihtiyaç duymazlar.

## Performans ve Optimizasyon (BI-10725)

- **Öncesi:** Tüm ağır AI çıkarımları (YOLO, Pose, Face) her karede senkron çalışıyor ve darboğaza neden oluyordu.
- **Sonrası:** `ai_frame_skip` mimarisi eklendi. Ağır çıkarımlar atlanarak çalıştırılıyor (skip=1) ve ara kareler cache'den okunuyor. Kişi yoksa (person_found=False) cache anında temizleniyor.

### Profiling Sonuçları (Gerçek Ölçümler)
*Test Ortamı: Windows 11, Python 3.10.11, Kamera Çözünürlüğü 1280x720*

| Konfigürasyon | Çıkarım Sıklığı | Arka Plan Yapay Zeka Hızı (Pipeline FPS) | Toplam Çıkarım Süresi (ms) |
| ------------- | ------------------- | ------------ | ------------------------- |
| `ai_frame_skip: 0` | Her kare (Eski) | ~11.5 | ~85.3 ms |
| `ai_frame_skip: 1` | 1 atla (Önerilen)| **~24.8** | ~40.2 ms (ortalama) |

### ⚠️ Önemli FPS Ayrımı
Performans ölçümlerini değerlendirirken iki farklı FPS değerini birbirine karıştırmamak gerekir:
- **Kamera FPS (UI FPS):** Arayüzde ekrana yansıyan ve doğrudan kameranın görüntü yakalama hızıdır (kamera donanımına bağlıdır).
- **Pipeline Ölçülen FPS:** Sadece yapay zeka çıkarımlarının (YOLO, Pose, Face vb.) arka planda ne kadar hızlı çalıştığını gösteren saf kod hızıdır (DEBUG loglarından okunur). Yapılan `ai_frame_skip` optimizasyonu doğrudan bu yapay zeka hızını (Pipeline FPS) iyileştirmiştir.

## Veri Gizliliği

Uygulama, kişi sayısı ve ekrana bakma süresi gibi anonim kullanım
metriklerini hizmetin çalışmasını ölçmek amacıyla işler. Kişiyi
tekilleştiren bir kimlik veya kamera görüntüsü veritabanına kaydedilmez.

Demografik analiz `privacy.enable_demographics` ayarıyla kontrol edilir
ve varsayılan olarak kapalıdır. Etkinleştirilirse yaş yalnızca yaş grubu
olarak tutulur. `privacy.store_raw: false` iken cinsiyet ve duygu
veritabanına yazılmaz.

Analytics kayıtları `privacy.retention_days` ile belirlenen süre boyunca
saklanır. Uygulama her başladığında daha eski kayıtlar otomatik silinir.
Kiosk ekranında veri işleme bildirimi gösterilir ve loglara yaş, cinsiyet
veya duygu değerleri yazılmaz.
