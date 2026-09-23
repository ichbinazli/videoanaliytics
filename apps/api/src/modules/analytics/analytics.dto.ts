import { z } from "zod";
import { AgeBucket, Emotion, Gender } from "../../generated/prisma/enums.js";
import { cursorPaginationSchema } from "../../utils/pagination.js";

/** Virgülle ayrılmış id listesi: ?deviceId=3,7,11 */
const idList = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(",")
          .map((part) => Number(part.trim()))
          .filter((id) => Number.isInteger(id) && id > 0)
      : undefined,
  );

export const analyticsFilterSchema = z
  .object({
    from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    siteId: idList,
    deviceId: idList,
    granularity: z.enum(["hour", "day", "auto"]).default("auto"),
    /** Isı haritası ve günlük kırılımlar için; boşsa tenant'ın zaman dilimi. */
    tz: z.string().max(64).optional(),
  })
  .refine((value) => value.to.getTime() >= value.from.getTime(), {
    message: "`to`, `from`'dan önce olamaz",
    path: ["to"],
  })
  .refine(
    (value) => value.to.getTime() - value.from.getTime() <= 400 * 24 * 60 * 60 * 1000,
    {
      // Sert bir tavan: tek bir istek yıllarca veriyi taramasın.
      message: "Aralık en fazla 400 gün olabilir",
      path: ["to"],
    },
  );

export type AnalyticsFilterDto = z.infer<typeof analyticsFilterSchema>;

export const breakdownQuerySchema = z.object({
  dimension: z.enum(["gender", "ageBucket", "emotion"]),
});

export const sessionListQuerySchema = analyticsFilterSchema.safeExtend({
  ...cursorPaginationSchema.shape,
  gender: z.enum([Gender.MALE, Gender.FEMALE, Gender.UNKNOWN]).optional(),
  ageBucket: z
    .enum([
      AgeBucket.CHILD,
      AgeBucket.YOUTH,
      AgeBucket.ADULT,
      AgeBucket.MIDDLE_AGED,
      AgeBucket.SENIOR,
      AgeBucket.UNKNOWN,
    ])
    .optional(),
  emotion: z
    .enum([
      Emotion.ANGRY,
      Emotion.DISGUST,
      Emotion.FEAR,
      Emotion.HAPPY,
      Emotion.SAD,
      Emotion.SURPRISE,
      Emotion.NEUTRAL,
      Emotion.UNKNOWN,
    ])
    .optional(),
  minDuration: z.coerce.number().int().min(0).optional(),
});

export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;

/** Dikkat hunisinde "gerçekten baktı" sayılan asgari süre. */
export const funnelQuerySchema = z.object({
  attentionThresholdSec: z.coerce.number().min(0).max(600).default(3),
});
