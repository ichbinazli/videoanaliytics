import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "../config/env.js";
import { Role } from "../generated/prisma/enums.js";

/**
 * Oturum token'ları.
 *
 * Access token  : JWT (HS256), kısa ömürlü, iptal edilemez — zaten 15 dakikada
 *                 kendiliğinden ölüyor.
 * Refresh token : OPAK rastgele değer, DB'de sha256'sı saklanır, her kullanımda
 *                 döner (rotation) ve aile bazlı reuse detection'a tabidir.
 *
 * Refresh token neden JWT değil? Çünkü JWT iptal edilemez. "Bu kullanıcıyı her
 * yerden çıkar" çok kiracılı bir panelde vazgeçilmez bir gereksinim; bunun için
 * sunucuda durumu tutmak zorundayız.
 */

const secretKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = "octo-va-api";
const AUDIENCE = "octo-va-panel";

export type AccessTokenClaims = {
  userId: number;
  /** SUPER_ADMIN için null. */
  tenantId: number | null;
  role: Role;
};

/**
 * Token'ın içindeki alanlar da doğrulanır.
 *
 * İmza geçerli olsa bile içeriğin şeklini varsaymıyoruz: eski formatta bir
 * token ya da secret'ı paylaşan başka bir servisin ürettiği bir token buradan
 * geçemesin.
 */
const claimsSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  tid: z.number().int().positive().nullable(),
  role: z.enum([Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.TENANT_VIEWER]),
});

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ tid: claims.tenantId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.userId))
    .setJti(randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(secretKey);
}

/** Geçersiz/süresi dolmuş token'da undefined döner — hata fırlatmaz. */
export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims | undefined> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });

    const parsed = claimsSchema.safeParse(payload);
    if (!parsed.success) return undefined;

    return {
      userId: Number(parsed.data.sub),
      tenantId: parsed.data.tid,
      role: parsed.data.role,
    };
  } catch {
    return undefined;
  }
}

// --- Refresh token ---------------------------------------------------------

export type GeneratedRefreshToken = {
  /** Çereze yazılan değer. */
  plaintext: string;
  /** DB'ye yazılan değer. */
  hash: string;
};

export function generateRefreshToken(): GeneratedRefreshToken {
  const plaintext = randomBytes(32).toString("base64url");
  return { plaintext, hash: hashRefreshToken(plaintext) };
}

/**
 * Düz sha256 — pepper yok, argon2 yok.
 * Değer 256 bit CSPRNG çıktısı olduğu için kaba kuvvete karşı zaten kapalı;
 * hash'lemenin tek amacı DB dump'ında kullanılabilir token bulunmaması.
 */
export function hashRefreshToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function newTokenFamilyId(): string {
  return randomUUID();
}

/** Refresh token'ın son kullanma tarihi. */
export function refreshTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}
