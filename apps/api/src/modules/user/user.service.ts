import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors/httpErrors.js";
import { Role } from "../../generated/prisma/enums.js";
import { hashPassword } from "../../security/password.js";
import type { PublicUser, UserRepository } from "../../repositories/user.repository.js";
import type { RefreshTokenRepository } from "../../repositories/refreshToken.repository.js";
import type { OffsetPagination, Paginated } from "../../utils/pagination.js";
import type { CreateUserDto, UpdateUserDto } from "./user.dto.js";

/** İşlemi yapan kullanıcı — yetki kurallarının bir kısmı buna bağlı. */
export type Actor = { userId: number; tenantId: number | null; role: Role };

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  list(pagination: OffsetPagination): Promise<Paginated<PublicUser>> {
    return this.users.list(pagination);
  }

  async getById(id: number): Promise<PublicUser> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError("Kullanıcı bulunamadı.");
    return user;
  }

  /**
   * tenantId parametre olarak ALINMAZ — actor'ın token'ından gelir.
   * Bir TENANT_ADMIN'in gövdeye tenantId yazıp başka müşteriye kullanıcı
   * eklemesinin yolu yoktur.
   */
  async create(dto: CreateUserDto, actor: Actor): Promise<PublicUser> {
    if (actor.role !== Role.SUPER_ADMIN && actor.tenantId === null) {
      throw new ForbiddenError("Hesabınız bir müşteriye bağlı değil.");
    }

    return this.users.create({
      email: dto.email,
      fullName: dto.fullName,
      role: dto.role,
      passwordHash: await hashPassword(dto.password),
      tenantId: actor.tenantId,
    });
  }

  async update(id: number, dto: UpdateUserDto, actor: Actor): Promise<PublicUser> {
    const target = await this.getById(id);

    // Kimse kendi rolünü değiştiremez ve kendini pasifleştiremez: bir yönetici
    // yanlışlıkla kendini kilitleyip tenant'ı yönetici'siz bırakabilir.
    if (target.id === actor.userId) {
      if (dto.role !== undefined && dto.role !== target.role) {
        throw new BadRequestError("Kendi rolünüzü değiştiremezsiniz.");
      }
      if (dto.isActive === false) {
        throw new BadRequestError("Kendi hesabınızı pasifleştiremezsiniz.");
      }
    }

    if (target.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError("Platform yöneticisi değiştirilemez.");
    }

    const updated = await this.users.update(id, dto);

    // Pasifleştirilen kullanıcının açık oturumları hemen düşer; access token'ın
    // 15 dakikası dolana kadar beklenmesi kabul edilemez.
    if (dto.isActive === false) {
      await this.refreshTokens.revokeAllForUser(id);
    }

    return updated;
  }

  async delete(id: number, actor: Actor): Promise<void> {
    const target = await this.getById(id);

    if (target.id === actor.userId) {
      throw new BadRequestError("Kendi hesabınızı silemezsiniz.");
    }
    if (target.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError("Platform yöneticisi silinemez.");
    }

    await this.users.delete(id);
  }
}
