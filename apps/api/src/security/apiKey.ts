import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import {
  API_KEY_PREFIX_LENGTH,
  API_KEY_SCHEME,
  API_KEY_SECRET_BYTES,
} from "../config/constants.js";

/**
 * Cihaz API key'leri.
 *
 * Format: vak_<12 karakter prefix>_<base64url secret>
 *   - prefix  : DÜZ METİN saklanır ve unique index'lidir. Sadece "hangi kaydı
 *               arayacağım" sorusunu cevaplar; kendisi bir sır değildir.
 *   - secret  : hiçbir zaman saklanmaz. Saklanan HMAC-SHA256(secret, pepper).
 *
 * NEDEN argon2 DEĞİL — bu kasıtlı bir asimetridir, "tutarsızlık" değil:
 * secret 32 byte CSPRNG çıktısıdır (256 bit entropi). Bir saldırganın bunu
 * kaba kuvvetle bulması imkânsız olduğu için yavaş KDF sıfır güvenlik
 * kazandırır; buna karşılık argon2'nin 50-100 ms'i HER ingest isteğine biner ve
 * çekirdek başına ~10 istek/sn tavanı koyar. Kullanıcı ŞİFRELERİ düşük
 * entropili olduğu için orada argon2id kullanılır (bkz. password.ts).
 *
 * Pepper (API_KEY_PEPPER) veritabanının dışında, ortam değişkeninde durur:
 * sadece DB dump'ı sızarsa key'ler yine de doğrulanamaz.
 */

export type GeneratedApiKey = {
  /** Kullanıcıya BİR KEZ gösterilen tam key. */
  plaintext: string;
  /** DB'ye düz metin yazılan arama anahtarı. */
  prefix: string;
  /** DB'ye yazılan hash. */
  hash: string;
};

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function hashApiKeySecret(secret: string): string {
  return createHmac("sha256", env.API_KEY_PEPPER).update(secret).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  // Prefix HEX üretilir, base64url değil.
  //
  // Sebep somut: base64url alfabesi `_` içeriyor ve ayırıcımız da `_`. Prefix
  // içinde bir `_` çıktığında key ayrıştırılamaz hâle geliyordu — üstelik
  // rastgele olduğu için ancak bazı key'lerde. Hex'te böyle bir çakışma yok.
  // (6 byte = 12 hex karakter; prefix bir sır değil, yalnızca arama anahtarı.)
  const prefix = randomBytes(API_KEY_PREFIX_LENGTH / 2).toString("hex");
  const secret = base64url(randomBytes(API_KEY_SECRET_BYTES));

  return {
    plaintext: `${API_KEY_SCHEME}_${prefix}_${secret}`,
    prefix,
    hash: hashApiKeySecret(secret),
  };
}

export type ParsedApiKey = { prefix: string; secret: string };

/** Başlıktan gelen değeri ayrıştırır. Format bozuksa undefined döner. */
export function parseApiKey(raw: string | undefined): ParsedApiKey | undefined {
  if (!raw) return undefined;

  const parts = raw.trim().split("_");
  if (parts.length < 3) return undefined;

  const [scheme, prefix] = parts;
  // Secret base64url'dur ve İÇİNDE `_` geçebilir; kalan parçaları geri
  // birleştirmek şart. `parts.length !== 3` kontrolü, secret'ında `_` olan
  // key'leri sessizce geçersiz sayardı.
  const secret = parts.slice(2).join("_");

  if (scheme !== API_KEY_SCHEME) return undefined;
  if (!prefix || !/^[0-9a-f]+$/.test(prefix)) return undefined;
  if (prefix.length !== API_KEY_PREFIX_LENGTH) return undefined;
  if (secret.length < 16) return undefined;

  return { prefix, secret };
}

/** Sabit zamanlı karşılaştırma — hash'i uzunluk/erken-çıkış üzerinden sızdırmamak için. */
export function verifyApiKeySecret(storedHash: string, secret: string): boolean {
  const computed = Buffer.from(hashApiKeySecret(secret), "hex");
  const stored = Buffer.from(storedHash, "hex");

  // timingSafeEqual eşit olmayan uzunlukta hata fırlatır; hash'ler sabit
  // uzunlukta olduğu için farklı uzunluk zaten bozuk kayıt demektir.
  if (computed.length !== stored.length) return false;

  return timingSafeEqual(computed, stored);
}
