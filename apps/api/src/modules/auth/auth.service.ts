import { randomBytes } from "node:crypto";

import type { RefreshTokenRepository } from "../../repositories/refreshToken.repository.js";
import type { TenantRepository } from "../../repositories/tenant.repository.js";
import type { PublicUser, UserRepository } from "../../repositories/user.repository.js";
import { InternalError, UnauthorizedError } from "../../errors/httpErrors.js";
import { hashPassword, verifyPassword } from "../../security/password.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  newTokenFamilyId,
  refreshTokenExpiry,
  signAccessToken,
} from "../../security/jwt.js";
import type { ChangePasswordDto, LoginDto, RegisterDto } from "./auth.dto.js";
import { logger } from "../../infra/logger.js";

export type IssuedSession = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

/**
 * Oturum kuralları. HTTP'den haberi yoktur — çerezleri controller yazar.
 */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly tenants: TenantRepository,
  ) {}

  async register(dto: RegisterDto): Promise<IssuedSession> {
    const tenant = await this.tenants.createWithAdmin({
      name: dto.companyName,
      slug: createTenantSlug(dto.companyName),
      admin: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash: await hashPassword(dto.password),
      },
    });

    const [admin] = tenant.users;
    if (!admin) {
      throw new InternalError("Müşteri yöneticisi oluşturulamadı.");
    }

    const { passwordHash: _passwordHash, ...publicUser } = admin;
    return this.issueSession(publicUser, newTokenFamilyId());
  }

  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.users.findByEmailForLogin(dto.email);

    // Kullanıcı yok / pasif / şifre yanlış — üçü de AYNI mesajı döner.
    // Aksi hâlde bu uç bir e-posta doğrulama servisine dönüşür.
    if (!user || !user.isActive) {
      // Zamanlama farkından kullanıcının varlığı anlaşılmasın diye yine de
      // bir hash doğrulaması yapıyoruz.
      await verifyPassword(
        "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000",
        dto.password,
      );
      throw new UnauthorizedError("E-posta veya şifre hatalı.");
    }

    const passwordOk = await verifyPassword(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw new UnauthorizedError("E-posta veya şifre hatalı.");
    }

    await this.users.touchLastLogin(user.id);

    const { passwordHash: _passwordHash, ...publicUser } = user;
    return this.issueSession(publicUser, newTokenFamilyId());
  }

  /**
   * Refresh token rotasyonu + reuse detection.
   *
   * Her kullanım token'ı iptal eder ve aynı ailede yenisini üretir. Zaten iptal
   * edilmiş bir token yeniden sunulursa bu bir kopyanın kullanıldığı anlamına
   * gelir: tüm aile düşürülür ve kullanıcı yeniden giriş yapmak zorunda kalır.
   */
  async refresh(plaintextToken: string): Promise<IssuedSession> {
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(plaintextToken));

    if (!stored) {
      throw new UnauthorizedError("Oturum süresi doldu, tekrar giriş yapın.");
    }

    if (stored.revokedAt !== null) {
      logger.warn(
        { userId: stored.userId, familyId: stored.familyId },
        "refresh token yeniden kullanıldı — aile iptal ediliyor",
      );
      await this.refreshTokens.revokeFamily(stored.userId, stored.familyId);
      throw new UnauthorizedError("Oturum güvenlik nedeniyle sonlandırıldı.");
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Oturum süresi doldu, tekrar giriş yapın.");
    }

    const user = await this.users.findActiveById(stored.userId);
    if (!user) {
      await this.refreshTokens.revokeFamily(stored.userId, stored.familyId);
      throw new UnauthorizedError("Hesap artık aktif değil.");
    }

    await this.refreshTokens.revokeById(stored.id);
    return this.issueSession(user, stored.familyId);
  }

  async logout(plaintextToken: string | undefined): Promise<void> {
    if (!plaintextToken) return;

    const stored = await this.refreshTokens.findByHash(hashRefreshToken(plaintextToken));
    if (!stored) return;

    // Tek token değil, ailenin tamamı: çıkış yapan kullanıcı o cihazdaki tüm
    // rotasyon zincirinin kapanmasını bekler.
    await this.refreshTokens.revokeFamily(stored.userId, stored.familyId);
  }

  async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.users.findByIdWithPasswordHash(userId);

    if (!user || !(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedError("Mevcut şifre hatalı.");
    }

    await this.users.update(userId, { passwordHash: await hashPassword(dto.newPassword) });

    // Şifre değişimi tüm oturumları düşürür — çalınmış bir oturumu kapatmanın
    // kullanıcı için tek yolu budur.
    await this.refreshTokens.revokeAllForUser(userId);
  }

  private async issueSession(user: PublicUser, familyId: string): Promise<IssuedSession> {
    const accessToken = await signAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    const refresh = generateRefreshToken();
    const expiresAt = refreshTokenExpiry();

    await this.refreshTokens.create({
      userId: user.id,
      familyId,
      tokenHash: refresh.hash,
      expiresAt,
    });

    return {
      user,
      accessToken,
      refreshToken: refresh.plaintext,
      refreshExpiresAt: expiresAt,
    };
  }
}

function createTenantSlug(companyName: string): string {
  const base = companyName
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "tenant";
  const suffix = randomBytes(4).toString("hex");

  return `${base.slice(0, 51)}-${suffix}`;
}
