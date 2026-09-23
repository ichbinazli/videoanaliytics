import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ORIGIN, login, type Session } from "../helpers/agent.js";
import { rawPrisma, seedTenant, truncateAll, type SeededTenant } from "../helpers/db.js";

/**
 * Bu dosya bu projenin en önemli testidir.
 *
 * Prisma guard extension'ı tenant sızıntısını ENGELLEYEN mekanizmadır, ama altı
 * ay sonra hâlâ çalıştığını garanti eden şey bu testtir: yeni bir route
 * eklenip aşağıdaki tabloya yazılmazsa, o route'un tenant sınırını koruduğuna
 * dair hiçbir kanıt yok demektir.
 *
 * Beklenen kod 404'tür, 403 değil. 403 "kayıt var ama giremezsin" bilgisini
 * sızdırır; başka bir tenant'ın kaydı bizim için HİÇ YOKTUR.
 */

let alfa: SeededTenant;
let beta: SeededTenant;
let alfaAdmin: Session;
let alfaViewer: Session;

beforeAll(async () => {
  await truncateAll();
  alfa = await seedTenant("alfa");
  beta = await seedTenant("beta");
  alfaAdmin = await login(alfa.adminEmail);
  alfaViewer = await login(alfa.viewerEmail);
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

describe("tenant izolasyonu — okuma", () => {
  it("kendi mağazasını görür", async () => {
    const response = await alfaAdmin.request.get("/api/v1/sites").expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe(alfa.siteId);
  });

  it("listede başka tenant'ın mağazası GÖRÜNMEZ", async () => {
    const response = await alfaAdmin.request.get("/api/v1/sites").expect(200);
    const ids = response.body.items.map((site: { id: number }) => site.id);
    expect(ids).not.toContain(beta.siteId);
  });

  it("başka tenant'ın mağaza id'siyle doğrudan sorgu 404 döner", async () => {
    await alfaAdmin.request.get(`/api/v1/sites/${beta.siteId}`).expect(404);
  });

  it("başka tenant'ın cihaz id'siyle doğrudan sorgu 404 döner", async () => {
    await alfaAdmin.request.get(`/api/v1/devices/${beta.deviceId}`).expect(404);
  });

  it("başka tenant'ın cihazının API key'leri listelenemez", async () => {
    await alfaAdmin.request.get(`/api/v1/devices/${beta.deviceId}/api-keys`).expect(404);
  });

  it("kullanıcı listesinde yalnızca kendi tenant'ı görünür", async () => {
    const response = await alfaAdmin.request.get("/api/v1/users").expect(200);
    const emails = response.body.items.map((user: { email: string }) => user.email);

    expect(emails).toContain(alfa.adminEmail);
    expect(emails).not.toContain(beta.adminEmail);
  });
});

describe("tenant izolasyonu — yazma", () => {
  it("başka tenant'ın mağazası güncellenemez", async () => {
    await alfaAdmin.request
      .patch(`/api/v1/sites/${beta.siteId}`)
      .set("Origin", ORIGIN)
      .send({ name: "ele geçirildi" })
      .expect(404);

    // Gerçekten değişmediğini ham client ile doğruluyoruz.
    const site = await rawPrisma.site.findUnique({ where: { id: beta.siteId } });
    expect(site?.name).not.toBe("ele geçirildi");
  });

  it("başka tenant'ın cihazı hizmetten çıkarılamaz", async () => {
    await alfaAdmin.request
      .delete(`/api/v1/devices/${beta.deviceId}`)
      .set("Origin", ORIGIN)
      .expect(404);

    const device = await rawPrisma.device.findUnique({ where: { id: beta.deviceId } });
    expect(device?.status).toBe("ACTIVE");
  });

  it("başka tenant'ın cihazına API key üretilemez", async () => {
    await alfaAdmin.request
      .post(`/api/v1/devices/${beta.deviceId}/api-keys`)
      .set("Origin", ORIGIN)
      .send({ rotate: false })
      .expect(404);

    const keyCount = await rawPrisma.deviceApiKey.count({
      where: { deviceId: beta.deviceId },
    });
    expect(keyCount).toBe(1); // seed'den gelen tek key
  });

  it("başka tenant'ın mağazasına cihaz eklenemez", async () => {
    await alfaAdmin.request
      .post("/api/v1/devices")
      .set("Origin", ORIGIN)
      .send({ siteId: beta.siteId, name: "sızma", code: "SIZMA-01" })
      .expect(404);
  });

  it("gövdeye tenantId yazmak hiçbir şeyi değiştirmez", async () => {
    // tenantId TOKEN'dan gelir; gövdedeki değer sessizce yok sayılır.
    const response = await alfaAdmin.request
      .post("/api/v1/sites")
      .set("Origin", ORIGIN)
      .send({ name: "sahte tenant", code: "SAHTE-01", tenantId: beta.tenantId })
      .expect(201);

    const created = await rawPrisma.site.findUnique({
      where: { id: response.body.site.id },
    });
    expect(created?.tenantId).toBe(alfa.tenantId);
  });

  it("X-Tenant-Id başlığı tenant kullanıcısı için yok sayılır", async () => {
    const response = await alfaAdmin.request
      .get("/api/v1/sites")
      .set("X-Tenant-Id", String(beta.tenantId))
      .expect(200);

    const ids = response.body.items.map((site: { id: number }) => site.id);
    expect(ids).not.toContain(beta.siteId);
  });
});

describe("rol kontrolü", () => {
  it("TENANT_VIEWER okuyabilir", async () => {
    await alfaViewer.request.get("/api/v1/sites").expect(200);
  });

  it("TENANT_VIEWER mağaza oluşturamaz", async () => {
    await alfaViewer.request
      .post("/api/v1/sites")
      .set("Origin", ORIGIN)
      .send({ name: "olmaz", code: "OLMAZ-01" })
      .expect(403);
  });

  it("TENANT_VIEWER kullanıcı listesini göremez", async () => {
    await alfaViewer.request.get("/api/v1/users").expect(403);
  });

  it("TENANT_VIEWER API key üretemez", async () => {
    await alfaViewer.request
      .post(`/api/v1/devices/${alfa.deviceId}/api-keys`)
      .set("Origin", ORIGIN)
      .send({ rotate: false })
      .expect(403);
  });

  it("TENANT_ADMIN müşteri (tenant) yönetimine erişemez", async () => {
    await alfaAdmin.request.get("/api/v1/tenants").expect(403);
  });
});

describe("kimlik doğrulama zorunluluğu", () => {
  it("çerezsiz istek 401 döner", async () => {
    const { app } = await import("../helpers/agent.js");
    const supertest = (await import("supertest")).default;
    await supertest(app).get("/api/v1/sites").expect(401);
  });
});
