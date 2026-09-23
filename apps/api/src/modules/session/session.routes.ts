import { Router } from "express";
import { MAX_CSV_ROWS } from "../../config/constants.js";
import { NotFoundError } from "../../errors/httpErrors.js";
import { validate } from "../../middleware/validate.middleware.js";
import type { ViewerSessionRepository } from "../../repositories/viewerSession.repository.js";
import { sessionListQuerySchema, type SessionListQuery } from "../analytics/analytics.dto.js";
import { toCsvRow } from "../../utils/csv.js";

/**
 * Ham oturum kayıtları.
 *
 * Analytics uçları agregat döner; burası tekil kayıtlara inmek isteyen kullanıcı
 * içindir (bir anomaliyi incelemek, veriyi dışa aktarmak).
 *
 * Ayrı bir service katmanı yok: burada iş kuralı değil, filtre çevirisi var.
 * Kural belirdiğinde eklenir.
 */
export function createSessionRouter(sessions: ViewerSessionRepository): Router {
  const router = Router();
  const withQuery = validate(sessionListQuerySchema, "query");

  function filtersOf(query: SessionListQuery) {
    return {
      from: query.from,
      to: query.to,
      ...(query.siteId?.length ? { siteIds: query.siteId } : {}),
      ...(query.deviceId?.length ? { deviceIds: query.deviceId } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.ageBucket ? { ageBucket: query.ageBucket } : {}),
      ...(query.emotion ? { emotion: query.emotion } : {}),
      ...(query.minDuration !== undefined ? { minDurationSec: query.minDuration } : {}),
    };
  }

  router.get("/", withQuery, async (req, res) => {
    const query = req.validatedQuery as SessionListQuery;
    const page = await sessions.listByCursor(filtersOf(query), query.limit, query.cursor);
    res.json(page);
  });

  /**
   * CSV dışa aktarım.
   *
   * Akış (stream) olarak yazılıyor: 100 bin satırı belleğe alıp tek seferde
   * göndermek, birkaç eşzamanlı istekte process'i düşürürdü. Sert satır tavanı
   * da tek bir isteğin tüm tabloyu çekmesini engelliyor.
   */
  router.get("/export", withQuery, async (req, res) => {
    const query = req.validatedQuery as SessionListQuery;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="oturumlar-${query.from.toISOString().slice(0, 10)}.csv"`,
    );

    // Excel'in UTF-8'i doğru açması için BOM — Türkçe karakterler bozulmasın.
    res.write("﻿");
    res.write(
      toCsvRow([
        "sessionUuid",
        "deviceId",
        "siteId",
        "startedAt",
        "endedAt",
        "durationSec",
        "personsPassed",
        "personsLooked",
        "lookingSeconds",
        "ageEstimate",
        "ageBucket",
        "gender",
        "emotion",
      ]),
    );

    for await (const chunk of sessions.streamAll(filtersOf(query), MAX_CSV_ROWS)) {
      for (const row of chunk) {
        res.write(
          toCsvRow([
            row.sessionUuid,
            row.deviceId,
            row.siteId,
            row.startedAt.toISOString(),
            row.endedAt.toISOString(),
            row.durationSec,
            row.personsPassed,
            row.personsLooked,
            row.lookingSeconds,
            row.ageEstimate,
            row.ageBucket,
            row.gender,
            row.emotion,
          ]),
        );
      }
    }

    res.end();
  });

  router.get("/:sessionUuid", async (req, res) => {
    const session = await sessions.findByUuid(String(req.params.sessionUuid));
    if (!session) throw new NotFoundError("Oturum bulunamadı.");

    res.json({
      session: {
        ...session,
        // BigInt JSON'a serialize edilemez; dışarıya zaten sessionUuid veriyoruz.
        id: undefined,
        lookingSeconds: session.lookingSeconds.toString(),
      },
    });
  });

  return router;
}
