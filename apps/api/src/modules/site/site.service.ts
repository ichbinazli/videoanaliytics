import { NotFoundError } from "../../errors/httpErrors.js";
import type {
  SiteRecord,
  SiteRepository,
} from "../../repositories/site.repository.js";
import type { OffsetPagination, Paginated } from "../../utils/pagination.js";
import type { CreateSiteDto, UpdateSiteDto } from "./site.dto.js";

export class SiteService {
  constructor(private readonly sites: SiteRepository) {}

  list(
    pagination: OffsetPagination,
    filters: { isActive?: boolean; search?: string },
  ): Promise<Paginated<SiteRecord>> {
    return this.sites.list(pagination, filters);
  }

  /**
   * Tenant sınırı burada GÖRÜNMÜYOR çünkü repository katmanının altındaki guard
   * hâlâ devrede: başka bir tenant'ın id'si null döner ve aşağıdaki kontrol onu
   * 404'e çevirir. 403 değil — o, kaydın var olduğunu sızdırırdı.
   */
  async getById(id: number): Promise<SiteRecord> {
    const site = await this.sites.findById(id);
    if (!site) throw new NotFoundError("Mağaza bulunamadı.");
    return site;
  }

  create(dto: CreateSiteDto): Promise<SiteRecord> {
    return this.sites.create(dto);
  }

  async update(id: number, dto: UpdateSiteDto): Promise<SiteRecord> {
    await this.getById(id);
    return this.sites.update(id, dto);
  }

  async deactivate(id: number): Promise<SiteRecord> {
    await this.getById(id);
    return this.sites.deactivate(id);
  }
}
