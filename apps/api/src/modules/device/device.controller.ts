import type { Request, Response } from "express";
import type { DeviceService } from "./device.service.js";
import type {
  CreateDeviceDto,
  DeviceListQuery,
  IssueApiKeyDto,
  UpdateDeviceDto,
} from "./device.dto.js";

export class DeviceController {
  constructor(private readonly service: DeviceService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as DeviceListQuery;
    res.json(
      await this.service.list(
        { page: query.page, pageSize: query.pageSize },
        { siteId: query.siteId, status: query.status, search: query.search },
      ),
    );
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    res.json({ device: await this.service.getById(Number(req.params.id)) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const device = await this.service.create(req.body as CreateDeviceDto);
    res.status(201).json({ device });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const device = await this.service.update(
      Number(req.params.id),
      req.body as UpdateDeviceDto,
    );
    res.json({ device });
  };

  decommission = async (req: Request, res: Response): Promise<void> => {
    res.json({ device: await this.service.decommission(Number(req.params.id)) });
  };

  listApiKeys = async (req: Request, res: Response): Promise<void> => {
    res.json({ keys: await this.service.listApiKeys(Number(req.params.id)) });
  };

  issueApiKey = async (req: Request, res: Response): Promise<void> => {
    const issued = await this.service.issueApiKey(
      Number(req.params.id),
      req.body as IssueApiKeyDto,
      req.auth!.userId,
    );

    // `plaintext` yalnızca burada döner. Panel bunu kopyalanabilir bir diyalogda
    // gösterip "bir daha göremeyeceksiniz" uyarısı vermek zorunda.
    res.status(201).json({
      key: issued.key,
      plaintext: issued.plaintext,
      warning: "Bu key yalnızca bir kez gösterilir. Şimdi kopyalayın.",
    });
  };

  revokeApiKey = async (req: Request, res: Response): Promise<void> => {
    const key = await this.service.revokeApiKey(
      Number(req.params.id),
      Number(req.params.keyId),
    );
    res.json({ key });
  };
}
