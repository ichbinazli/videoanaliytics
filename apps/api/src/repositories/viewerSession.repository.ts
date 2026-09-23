import type { ExtendedPrismaClient } from "../infra/prisma.js";
import type { AgeBucket, Emotion, Gender } from "../generated/prisma/enums.js";
import type { ViewerSessionInput } from "../modules/ingest/ingest.mapper.js";
import { cursorPage, type CursorPage } from "../utils/pagination.js";

export type SessionFilters = {
  from: Date;
  to: Date;
  siteIds?: number[];
  deviceIds?: number[];
  gender?: Gender;
  ageBucket?: AgeBucket;
  emotion?: Emotion;
  minDurationSec?: number;
};

export type SessionRow = {
  sessionUuid: string;
  siteId: number;
  deviceId: number;
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  personsPassed: number;
  personsLooked: number;
  lookingSeconds: string;
  ageEstimate: number | null;
  ageBucket: AgeBucket;
  gender: Gender;
  emotion: Emotion;
};

export class ViewerSessionRepository {
  constructor(private readonly prisma: ExtendedPrismaClient) {}

  /**
   * Toplu ekleme, tekrarları sessizce atlar.
   *
   * MySQL'de `skipDuplicates` INSERT IGNORE'a dönüşür ve
   * @@unique([deviceId, sessionUuid)] sayesinde tekrar gönderilen bir batch
   * SIFIR satır ekler. Cihazın çevrimdışı kuyruğunu boşaltırken aynı kaydı
   * birden fazla göndermesi bu yüzden bedavadır.
   */
  async createMany(rows: ViewerSessionInput[]): Promise<number> {
    const result = await this.prisma.viewerSession.createMany({
      data: rows.map((row) => ({
        ...row,
        // Prisma Decimal alanı string/number kabul eder.
        lookingSeconds: row.lookingSeconds,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  /** Ham oturum listesi — cursor tabanlı; milyonlarca satırda OFFSET taramaya döner. */
  async listByCursor(
    filters: SessionFilters,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<SessionRow>> {
    const where = this.buildWhere(filters);

    // Cursor formatı: "<startedAt ISO>|<sessionUuid>". Tek başına startedAt
    // tekil değil — aynı milisaniyede biten iki oturum kayıt atlanmasına yol açardı.
    const decoded = cursor ? decodeCursor(cursor) : undefined;

    const rows = await this.prisma.viewerSession.findMany({
      where: decoded
        ? {
            ...where,
            OR: [
              { startedAt: { lt: decoded.startedAt } },
              {
                startedAt: decoded.startedAt,
                sessionUuid: { lt: decoded.sessionUuid },
              },
            ],
          }
        : where,
      orderBy: [{ startedAt: "desc" }, { sessionUuid: "desc" }],
      take: limit + 1,
      select: {
        sessionUuid: true,
        siteId: true,
        deviceId: true,
        startedAt: true,
        endedAt: true,
        durationSec: true,
        personsPassed: true,
        personsLooked: true,
        lookingSeconds: true,
        ageEstimate: true,
        ageBucket: true,
        gender: true,
        emotion: true,
      },
    });

    const mapped = rows.map((row) => ({
      ...row,
      lookingSeconds: row.lookingSeconds.toString(),
    }));

    return cursorPage(mapped, limit, (row) =>
      encodeCursor(row.startedAt, row.sessionUuid),
    );
  }

  findByUuid(sessionUuid: string) {
    return this.prisma.viewerSession.findFirst({ where: { sessionUuid } });
  }

  count(filters: SessionFilters): Promise<number> {
    return this.prisma.viewerSession.count({ where: this.buildWhere(filters) });
  }

  /** CSV export'u için akış; tüm sonucu belleğe almadan sayfa sayfa ilerler. */
  async *streamAll(filters: SessionFilters, maxRows: number): AsyncGenerator<SessionRow[]> {
    const pageSize = 2_000;
    let cursor: string | undefined;
    let emitted = 0;

    while (emitted < maxRows) {
      const page = await this.listByCursor(
        filters,
        Math.min(pageSize, maxRows - emitted),
        cursor,
      );

      if (page.items.length === 0) return;

      emitted += page.items.length;
      yield page.items;

      if (!page.nextCursor) return;
      cursor = page.nextCursor;
    }
  }

  private buildWhere(filters: SessionFilters) {
    return {
      startedAt: { gte: filters.from, lte: filters.to },
      ...(filters.siteIds?.length ? { siteId: { in: filters.siteIds } } : {}),
      ...(filters.deviceIds?.length ? { deviceId: { in: filters.deviceIds } } : {}),
      ...(filters.gender ? { gender: filters.gender } : {}),
      ...(filters.ageBucket ? { ageBucket: filters.ageBucket } : {}),
      ...(filters.emotion ? { emotion: filters.emotion } : {}),
      ...(filters.minDurationSec !== undefined
        ? { durationSec: { gte: filters.minDurationSec } }
        : {}),
    };
  }
}

function encodeCursor(startedAt: Date, sessionUuid: string): string {
  return Buffer.from(`${startedAt.toISOString()}|${sessionUuid}`).toString("base64url");
}

function decodeCursor(cursor: string): { startedAt: Date; sessionUuid: string } {
  const [iso, uuid] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const startedAt = new Date(iso ?? "");

  // Bozuk cursor'ı hata yerine "baştan başla" olarak yorumlamak, kullanıcının
  // eski bir linki açtığında 500 görmesini engeller.
  if (Number.isNaN(startedAt.getTime()) || !uuid) {
    return { startedAt: new Date(8.64e15), sessionUuid: "￿" };
  }

  return { startedAt, sessionUuid: uuid };
}
