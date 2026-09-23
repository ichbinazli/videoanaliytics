import type { Request, Response } from "express";
import type { IngestService } from "./ingest.service.js";
import type { HeartbeatDto, SessionBatchDto } from "./ingest.dto.js";

export class IngestController {
  constructor(private readonly service: IngestService) {}

  /**
   * 202 döner, 201 değil.
   *
   * Sebep sözleşmede: kısmi başarı da başarıdır ve cihaz yanıtın gövdesine
   * bakarak hangi kayıtları kuyruğundan sileceğine karar verir. 201 "hepsi
   * oluşturuldu" anlamına gelirdi ki bu her zaman doğru değil.
   */
  ingestSessions = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.ingestSessions(req.body as SessionBatchDto, req.device!);
    res.status(202).json(result);
  };

  heartbeat = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.heartbeat(req.body as HeartbeatDto, req.device!);
    res.json({ ok: true, ...result });
  };
}
