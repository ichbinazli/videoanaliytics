import type { ExtendedPrismaClient } from "../infra/prisma.js";
import type { Role } from "../generated/prisma/enums.js";
import { runAsSystem } from "../infra/tenantContext.js";
import {
  paginated,
  toPrismaSkipTake,
  type OffsetPagination,
  type Paginated,
} from "../utils/pagination.js";

/**
 * Prisma'ya dokunan tek katman.
 *
 * Amacı "ileride veritabanını değiştirebilelim" değil — o hiç olmuyor. Amacı
 * sayfalama ve tenant kapsamının TEK geçiş noktası olması; servis katmanında
 * dağınık `where` klozları oluşmasını engellemek.
 */

/** Şifre hash'i asla dışarı çıkmasın diye açık seçim. */
const publicUserSelect = {
  id: true,
  tenantId: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export type PublicUser = {
  id: number;
  tenantId: number | null;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export class UserRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  /**
   * Login için e-posta araması.
   *
   * runAsSystem: kullanıcının hangi tenant'a ait olduğunu ancak onu BULDUKTAN
   * sonra öğrenebiliriz — tenant scope'u burada henüz açılamaz. Bu, kaçış
   * yolunun meşru dört kullanımından biridir.
   */
  findByEmailForLogin(email: string) {
    return runAsSystem("login: tenant, kullanıcı bulunmadan bilinemez", () =>
      this.prisma.user.findUnique({
        where: { email },
        select: { ...publicUserSelect, passwordHash: true },
      }),
    );
  }

  /** Şifre değişiminde mevcut şifreyi doğrulamak için hash'i de getirir. */
  findByIdWithPasswordHash(id: number) {
    return runAsSystem("şifre değişimi: kullanıcı kendi kaydına erişiyor", () =>
      this.prisma.user.findUnique({
        where: { id },
        select: { ...publicUserSelect, passwordHash: true },
      }),
    );
  }

  findById(id: number): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  }

  /** Token doğrulamasından sonra kullanıcının hâlâ aktif olduğunu teyit eder. */
  findActiveById(id: number): Promise<PublicUser | null> {
    return runAsSystem("auth: token sahibi hâlâ aktif mi", () =>
      this.prisma.user.findFirst({
        where: { id, isActive: true },
        select: publicUserSelect,
      }),
    );
  }

  async list(pagination: OffsetPagination): Promise<Paginated<PublicUser>> {
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        ...toPrismaSkipTake(pagination),
        orderBy: { createdAt: "desc" },
        select: publicUserSelect,
      }),
      this.prisma.user.count(),
    ]);

    return paginated(items, total, pagination);
  }

  create(data: {
    email: string;
    fullName: string;
    passwordHash: string;
    role: Role;
    tenantId: number | null;
  }): Promise<PublicUser> {
    // tenantId açıkça veriliyor; extension aynı değeri enjekte edeceği için
    // çakışma olmaz. SUPER_ADMIN oluşturmak system scope'u gerektirir.
    return this.prisma.user.create({ data, select: publicUserSelect });
  }

  update(
    id: number,
    data: Partial<{
      fullName: string;
      role: Role;
      isActive: boolean;
      passwordHash: string;
    }>,
  ): Promise<PublicUser> {
    return this.prisma.user.update({ where: { id }, data, select: publicUserSelect });
  }

  touchLastLogin(id: number): Promise<unknown> {
    return runAsSystem("login: tenant scope'u henüz açılmadı", () =>
      this.prisma.user.update({
        where: { id },
        data: { lastLoginAt: new Date() },
        select: { id: true },
      }),
    );
  }

  delete(id: number): Promise<unknown> {
    return this.prisma.user.delete({ where: { id }, select: { id: true } });
  }
}
