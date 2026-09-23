import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../config/constants.js";

/**
 * İki sayfalama biçimi kullanıyoruz — hangisinin nerede olduğu bilinçli bir seçim:
 *
 *  - offset : yönetim listeleri (mağaza, cihaz, kullanıcı). Küçük tablolar,
 *             kullanıcı "sayfa 7"ye atlamak isteyebilir.
 *  - cursor : ham oturum listesi. Milyonlarca satırda OFFSET 500000 taramaya
 *             dönüşür; ayrıca kullanıcı gezinirken yeni satır geldiğinde offset
 *             kayar ve kayıt atlanır.
 */

export const offsetPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type OffsetPagination = z.infer<typeof offsetPaginationSchema>;

export function toPrismaSkipTake(pagination: OffsetPagination): {
  skip: number;
  take: number;
} {
  return {
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  };
}

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function paginated<T>(
  items: T[],
  total: number,
  pagination: OffsetPagination,
): Paginated<T> {
  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

export const cursorPaginationSchema = z.object({
  /** Son alınan kaydın cursor'ı; ilk sayfada boş bırakılır. */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

export type CursorPage<T> = {
  items: T[];
  /** Sonraki sayfa yoksa null. */
  nextCursor: string | null;
};

/**
 * `limit + 1` kayıt çekilip fazlası atılarak "daha var mı" sorusu ekstra bir
 * COUNT sorgusu olmadan cevaplanır.
 */
export function cursorPage<T>(
  rows: T[],
  limit: number,
  toCursor: (row: T) => string,
): CursorPage<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }

  const items = rows.slice(0, limit);
  const last = items[items.length - 1];

  return { items, nextCursor: last ? toCursor(last) : null };
}
