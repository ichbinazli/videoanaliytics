import { Router } from "express";
import { validate } from "../../middleware/validate.middleware.js";
import type { AnalyticsController } from "./analytics.controller.js";
import { analyticsFilterSchema } from "./analytics.dto.js";

/**
 * Tüm analytics uçları AYNI filtre sözleşmesini paylaşır: from, to, siteId[],
 * deviceId[], granularity, tz. Panelin global filtre barı tek bir query string
 * üretip her karta aynen gönderebilsin diye.
 *
 * Hepsi okuma; rol kısıtı yok. Tenant sınırı zaten zincirin üstünde.
 */
export function createAnalyticsRouter(controller: AnalyticsController): Router {
  const router = Router();
  const withFilter = validate(analyticsFilterSchema, "query");

  router.get("/overview", withFilter, controller.overview);
  router.get("/timeseries", withFilter, controller.timeseries);
  router.get("/breakdown", withFilter, controller.breakdown);
  router.get("/devices", withFilter, controller.devices);
  router.get("/heatmap", withFilter, controller.heatmap);
  router.get("/funnel", withFilter, controller.funnel);

  return router;
}
