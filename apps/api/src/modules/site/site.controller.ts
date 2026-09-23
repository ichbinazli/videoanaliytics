import type { Request, Response } from "express";
import type { SiteService } from "./site.service.js";
import type { CreateSiteDto, SiteListQuery, UpdateSiteDto } from "./site.dto.js";

export class SiteController {
  constructor(private readonly service: SiteService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as SiteListQuery;
    const result = await this.service.list(
      { page: query.page, pageSize: query.pageSize },
      { isActive: query.isActive, search: query.search },
    );
    res.json(result);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    res.json({ site: await this.service.getById(Number(req.params.id)) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const site = await this.service.create(req.body as CreateSiteDto);
    res.status(201).json({ site });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const site = await this.service.update(Number(req.params.id), req.body as UpdateSiteDto);
    res.json({ site });
  };

  deactivate = async (req: Request, res: Response): Promise<void> => {
    const site = await this.service.deactivate(Number(req.params.id));
    res.json({ site });
  };
}
