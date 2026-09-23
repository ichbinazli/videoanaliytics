# Veri Toplama (Ingest) Kontratı — v1

Cihazların uyduğu wire kontratı. Bu dosya `apps/api/src/modules/ingest/ingest.dto.ts`
ile birlikte güncellenir; uyuşmazlık durumunda **DTO otoritedir**.

Taban URL: `https://<api-host>/ingest/v1`

## Kimlik doğrulama

Her istek `X-Api-Key` başlığı taşır:

```
X-Api-Key: vak_a1b2c3d4e5f6_<secret>
```

- Key, panelden cihaz oluşturulurken **bir kez** gösterilir; sunucu yalnızca hash'ini saklar.
- **Cihaz kimliği key'in kendisidir.** Payload cihaz id'si taşımaz — istemciden
  gelen bir id zaten güvenilmez olurdu.
- Geçersiz/iptal edilmiş key → `401`. Cihaz bu durumda kuyruğunu **silmez**,
  maksimum backoff'a çıkar ve loglar.

## `POST /ingest/v1/sessions`

Biten oturumların toplu yüklenmesi.

### İstek

```jsonc
{
  "schemaVersion": 1,
  "sentAt": "2026-08-06T09:12:33.412Z",
  "device": {
    "appVersion": "0.1.0",
    "spoolDepth": 128            // kuyrukta bekleyen kayıt sayısı (teşhis için)
  },
  "sessions": [
    {
      "sessionUuid": "8f14e45f-ceea-467a-9c4c-0f2c0f2c0f2c",  // cihaz üretir
      "startedAt": "2026-08-06T09:10:02.100Z",                // ISO-8601 UTC
      "endedAt": "2026-08-06T09:10:31.400Z",
      "durationSec": 29,
      "personsPassed": 3,        // ekran önünden geçen
      "personsLooked": 2,        // ekrana bakan
      "lookingSeconds": 18.4,    // toplam dikkat süresi
      "ageEstimate": 31,         // sayısal medyan tahmin (opsiyonel)
      "ageBucketRaw": "Yetişkin",// SADECE ageEstimate yoksa fallback
      "gender": "Man",           // ham DeepFace etiketi; sunucu normalize eder
      "emotion": "happy"         // ham DeepFace etiketi
    }
  ]
}
```

Alan kuralları:

| Alan | Tip | Zorunlu | Not |
|---|---|---|---|
| `schemaVersion` | int | ✔ | Şu an sabit `1` |
| `sentAt` | ISO-8601 | ✔ | Cihaz saati |
| `sessions[].sessionUuid` | UUIDv4 | ✔ | **Idempotency anahtarı** — retry'larda değişmez |
| `sessions[].startedAt` / `endedAt` | ISO-8601 UTC | ✔ | Saat kayması penceresine tabi |
| `sessions[].durationSec` | int ≥ 0 | ✔ | |
| `sessions[].personsPassed` / `personsLooked` | int ≥ 0 | ✔ | |
| `sessions[].lookingSeconds` | float ≥ 0 | ✔ | |
| `sessions[].ageEstimate` | int 0–120 | — | Varsa `ageBucketRaw`'a bakılmaz |
| `sessions[].ageBucketRaw` | string | — | `Çocuk`/`Genç`/`Yetişkin`/`Orta Yaşlı`/`Yaşlı` |
| `sessions[].gender` | string | — | `Man`/`Woman`/`Bilinmiyor` |
| `sessions[].emotion` | string | — | DeepFace baskın duygu etiketi |

### Yanıt — `202 Accepted`

```jsonc
{
  "accepted": 48,
  "duplicates": 2,
  "rejected": [
    { "sessionUuid": "…", "reason": "TIMESTAMP_OUT_OF_WINDOW" }
  ],
  "serverTime": "2026-08-06T09:12:33.910Z"
}
```

**Cihaz davranışı:** `accepted ∪ duplicates ∪ rejected` içindeki her uuid
kuyruktan silinir. Yalnızca 2xx **olmayan** yanıtlarda retry edilir.

`rejected` kalemleri kalıcı olarak bozuk kayıtlardır; retry etmek kuyruğun başını
sonsuza kadar tıkar. WARNING seviyesinde loglanıp düşürülürler.

### Limitler ve hata kodları

| Durum | Kod | Cihazın yapması gereken |
|---|---|---|
| Başarılı (kısmi dahil) | `202` | Kuyruğu boşalt |
| Doğrulama hatası | `400` | Payload bozuk — logla, düşür |
| Geçersiz / iptal edilmiş key | `401` | Max backoff, kuyruğu **koru** |
| Batch çok büyük (>500 oturum veya >1 MB) | `413` | Batch boyutunu yarıya indir (taban 5), hemen dene |
| Rate limit (60 istek/dk) | `429` | Jitter'lı exponential backoff |
| Sunucu hatası | `5xx` | Jitter'lı exponential backoff |

**Saat kayması penceresi:** `startedAt` 48 saatten fazla gelecekte veya 90 günden
eski ise kayıt `rejected` listesine düşer — istek `4xx` **olmaz**. Sunucu hem
`startedAt` (cihaz) hem `receivedAt` (sunucu) değerini saklar, böylece kayma
operasyonel olarak görülebilir.

**Idempotency:** `(deviceId, sessionUuid)` çifti tekildir. Aynı batch tekrar
gönderilirse sıfır satır eklenir ve hepsi `duplicates` olarak raporlanır.
Agregasyonlar ham satırlardan yeniden hesaplandığı için duplicate hiçbir yoldan
raporlara sızamaz.

## `POST /ingest/v1/heartbeat`

Cihazın canlı olduğunu ve durumunu bildirir. Oturum üretilmese bile periyodik
gönderilir.

```jsonc
// İstek
{ "appVersion": "0.1.0", "spoolDepth": 0 }

// Yanıt 200
{ "ok": true, "serverTime": "2026-08-06T09:12:33.910Z" }
```

Sunucu `Device.lastSeenAt` ve `Device.appVersion` alanlarını günceller; panel
online/offline durumunu buradan hesaplar.

## Gizlilik ile ilişkisi

Kiosk'un `privacy` yapılandırması neyin **gönderileceğini** de belirler; telemetri
onun üstünden atlamaz:

| `privacy.store_raw` | Gönderilen |
|---|---|
| `false` (varsayılan) | Oturum sayımları + yaş **kovası**. `gender`, `emotion` ve `ageEstimate` alanları `null` gider. |
| `true` | Yukarıdakiler + cinsiyet, duygu ve sayısal yaş. |

Sayısal yaş bilinçli olarak `store_raw` kapsamındadır: `31` değeri `"Yetişkin"`
kovasından daha ayırt edicidir. Kapalıyken sunucu yaş kovasını `ageBucketRaw`
alanından türetir — kontratın zaten tanımlı fallback yolu budur.

`privacy.enable_demographics: false` iken DeepFace hiç çalışmaz; bu durumda
oturumlar demografi alanları boş olarak gönderilir ama **sayımlar gönderilmeye
devam eder** — onlar anonimdir ve raporlamanın çekirdeğidir.

## Sunucu tarafı normalizasyon

Ham etiketler DB'ye asla girmez; `ingest.mapper.ts` şu dönüşümü uygular:

| Gelen | Saklanan |
|---|---|
| `gender: "Man"` / `"Woman"` / diğer | `MALE` / `FEMALE` / `UNKNOWN` |
| `emotion: "happy"` … | `HAPPY` … / `UNKNOWN` |
| `ageEstimate: 31` | `ageEstimate=31`, `ageBucket=ADULT` (sunucuda türetilir) |
| `ageEstimate` yok, `ageBucketRaw: "Yetişkin"` | `ageEstimate=null`, `ageBucket=ADULT` |

Yaş kovası sınırları **sunucuda** yaşar (12 / 25 / 45 / 60). Sayısal değer
saklandığı için müşteri farklı bantlar isterse geçmiş veri yeniden kovalanabilir.
