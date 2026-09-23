import {
  API_KEY_MAX_ACTIVE_PER_DEVICE,
  API_KEY_ROTATION_GRACE_DAYS,
  DEVICE_OFFLINE_AFTER_MS,
} from "../../config/constants.js";
import { ConflictError, NotFoundError } from "../../errors/httpErrors.js";
import { generateApiKey } from "../../security/apiKey.js";
import type {
  ApiKeyMetadata,
  DeviceApiKeyRepository,
} from "../../repositories/deviceApiKey.repository.js";
import type {
  DeviceRecord,
  DeviceRepository,
} from "../../repositories/device.repository.js";
import type { SiteRepository } from "../../repositories/site.repository.js";
import type { OffsetPagination, Paginated } from "../../utils/pagination.js";
import type { DeviceStatus } from "../../generated/prisma/enums.js";
import type { CreateDeviceDto, IssueApiKeyDto, UpdateDeviceDto } from "./device.dto.js";

export type DeviceWithHealth = DeviceRecord & { isOnline: boolean };

export type IssuedApiKey = {
  key: ApiKeyMetadata;
  /** Yalnızca BU yanıtta döner; sunucu hash'inden geri üretemez. */
  plaintext: string;
};

export class DeviceService {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly apiKeys: DeviceApiKeyRepository,
    private readonly sites: SiteRepository,
  ) {}

  async list(
    pagination: OffsetPagination,
    filters: { siteId?: number; status?: DeviceStatus; search?: string },
  ): Promise<Paginated<DeviceWithHealth>> {
    const page = await this.devices.list(pagination, filters);
    return { ...page, items: page.items.map((device) => this.withHealth(device)) };
  }

  async getById(id: number): Promise<DeviceWithHealth> {
    const device = await this.devices.findById(id);
    if (!device) throw new NotFoundError("Cihaz bulunamadı.");
    return this.withHealth(device);
  }

  async create(dto: CreateDeviceDto): Promise<DeviceRecord> {
    // Mağazanın varlığını AYRICA doğruluyoruz: guard sayesinde başka tenant'ın
    // mağazası null döner, dolayısıyla bu kontrol aynı zamanda tenant sınırını
    // da kapatır. Aksi hâlde foreign key hatası 500 olarak dönerdi.
    const site = await this.sites.findById(dto.siteId);
    if (!site) throw new NotFoundError("Mağaza bulunamadı.");

    return this.devices.create(dto);
  }

  async update(id: number, dto: UpdateDeviceDto): Promise<DeviceRecord> {
    await this.getById(id);

    if (dto.siteId !== undefined) {
      const site = await this.sites.findById(dto.siteId);
      if (!site) throw new NotFoundError("Mağaza bulunamadı.");
    }

    return this.devices.update(id, dto);
  }

  async decommission(id: number): Promise<DeviceRecord> {
    await this.getById(id);
    return this.devices.decommission(id);
  }

  /**
   * getById çağrısı ŞART.
   *
   * Doğrudan listeye gitseydik guard, başka tenant'ın cihazı için boş bir dizi
   * döndürürdü ve uç 200 verirdi — yani "bu cihazın key'i yok" cevabı. Oysa
   * doğru cevap "böyle bir cihaz yok". Cihazın varlığını önce doğrulamak bunu
   * 404'e çevirir. (Bu satır bir integration testinin yakaladığı gerçek bir
   * hatanın düzeltmesidir; silmeyin.)
   */
  async listApiKeys(deviceId: number): Promise<ApiKeyMetadata[]> {
    await this.getById(deviceId);
    return this.apiKeys.listForDevice(deviceId);
  }

  /**
   * Yeni API key üretir.
   *
   * `rotate: true` ise mevcut aktif key'lere bir bitiş tarihi yazılır — sahadaki
   * cihaz güncellenene kadar çalışmaya devam eder. `rotate: false` ise zaten
   * aktif key varsa hata verilir; sessizce ikinci bir key üretmek, birinin
   * unutulduğu anlamına gelirdi.
   */
  async issueApiKey(
    deviceId: number,
    dto: IssueApiKeyDto,
    createdById: number,
  ): Promise<IssuedApiKey> {
    await this.getById(deviceId);

    const activeCount = await this.apiKeys.countActiveForDevice(deviceId);

    if (activeCount >= API_KEY_MAX_ACTIVE_PER_DEVICE) {
      throw new ConflictError(
        `Bu cihazın zaten ${activeCount} aktif key'i var. Yeni key üretmeden önce birini iptal edin.`,
      );
    }

    if (activeCount > 0) {
      if (!dto.rotate) {
        throw new ConflictError(
          "Cihazın aktif bir API key'i var. Değiştirmek için rotate=true gönderin ya da mevcut key'i iptal edin.",
        );
      }

      const graceEnd = new Date(
        Date.now() + API_KEY_ROTATION_GRACE_DAYS * 24 * 60 * 60 * 1000,
      );

      const existing = await this.apiKeys.listForDevice(deviceId);
      await Promise.all(
        existing
          .filter((key) => key.status === "ACTIVE" && key.expiresAt === null)
          .map((key) => this.apiKeys.scheduleExpiry(key.id, graceEnd)),
      );
    }

    const generated = generateApiKey();
    const key = await this.apiKeys.create({
      deviceId,
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      label: dto.label ?? null,
      createdById,
    });

    return { key, plaintext: generated.plaintext };
  }

  async revokeApiKey(deviceId: number, keyId: number): Promise<ApiKeyMetadata> {
    await this.getById(deviceId);

    const keys = await this.apiKeys.listForDevice(deviceId);
    const target = keys.find((key) => key.id === keyId);
    if (!target) throw new NotFoundError("API key bulunamadı.");

    return this.apiKeys.revoke(keyId);
  }

  private withHealth(device: DeviceRecord): DeviceWithHealth {
    const lastSeen = device.lastSeenAt?.getTime() ?? 0;
    return {
      ...device,
      isOnline:
        device.status === "ACTIVE" && Date.now() - lastSeen < DEVICE_OFFLINE_AFTER_MS,
    };
  }
}
