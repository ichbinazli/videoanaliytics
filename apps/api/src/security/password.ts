import argon2 from "argon2";

/**
 * Kullanıcı şifreleri — argon2id.
 *
 * Parametreler OWASP'ın 2024 asgari önerisi: 19 MiB bellek, 2 geçiş, 1 paralellik.
 *
 * Cihaz API key'leri BİLİNÇLİ olarak farklı bir yol izler (bkz. apiKey.ts):
 * onlar 256 bit CSPRNG entropisi taşır, bu yüzden yavaş bir KDF hiçbir şey
 * kazandırmaz. Şifreler ise düşük entropilidir; yavaşlık burada tam olarak
 * istenen şeydir.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Bozuk/eski format bir hash doğrulama hatasıdır, sunucu hatası değil.
    return false;
  }
}
