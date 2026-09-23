import type { Request, Response } from "express";
import { z } from "zod";
import type { AnalyticsService } from "./analytics.service.js";
import type { AnalyticsFilterDto } from "./analytics.dto.js";
import { breakdownQuerySchema, funnelQuerySchema } from "./analytics.dto.js";

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  private filterOf(req: Request): AnalyticsFilterDto {
    return req.validatedQuery as AnalyticsFilterDto;
  }

  overview = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.service.overview(this.filterOf(req)));
  };

  timeseries = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.service.timeseries(this.filterOf(req)));
  };

  breakdown = async (req: Request, res: Response): Promise<void> => {
    // dimension ana filtreden ayrı doğrulanıyor: yalnızca bu uçta anlamlı.
    const { dimension } = breakdownQuerySchema.parse({
      dimension: (req.query as Record<string, unknown>)["dimension"],
    });

    res.json(await this.service.breakdown(this.filterOf(req), dimension));
  };

  devices = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.service.deviceLeaderboard(this.filterOf(req)));
  };

  heatmap = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.service.heatmap(this.filterOf(req)));
  };

  funnel = async (req: Request, res: Response): Promise<void> => {
    const { attentionThresholdSec } = funnelQuerySchema.parse({
      attentionThresholdSec: (req.query as Record<string, unknown>)["attentionThresholdSec"],
    });

    res.json(await this.service.funnel(this.filterOf(req), attentionThresholdSec));
  };
}

export type BreakdownDimension = z.infer<typeof breakdownQuerySchema>["dimension"];
