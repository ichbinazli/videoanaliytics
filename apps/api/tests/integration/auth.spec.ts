import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ORIGIN, app, login } from "../helpers/agent.js";
import {
  TEST_PASSWORD,
  rawPrisma,
  seedTenant,
  truncateAll,
  type SeededTenant,
} from "../helpers/db.js";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../src/config/constants.js";

let tenant: SeededTenant;

beforeAll(async () => {
  await truncateAll();
  tenant = await seedTenant("auth");
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

describe("musteri kaydi", () => {
  it("tenant ve ilk TENANT_ADMIN kullanicisini birlikte olusturur", async () => {
    const email = "kurucu@yeni-musteri.test";
    const response = await supertest(app)
      .post("/api/v1/auth/register")
      .set("Origin", ORIGIN)
      .send({
        companyName: "Yeni Musteri A.S.",
        fullName: "Musteri Yoneticisi",
        email,
        password: TEST_PASSWORD,
      })
      .expect(201);

    const user = await rawPrisma.user.findUniqueOrThrow({
      where: { email },
      include: { tenant: true },
    });

    expect(user.role).toBe("TENANT_ADMIN");
    expect(user.tenant?.name).toBe("Yeni Musteri A.S.");
    expect(response.body.user.email).toBe(email);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("e-posta cakisirsa bos tenant birakmaz", async () => {
    const tenantCountBefore = await rawPrisma.tenant.count();

    await supertest(app)
      .post("/api/v1/auth/register")
      .set("Origin", ORIGIN)
      .send({
        companyName: "Olusmamasi Gereken Sirket",
        fullName: "Ayni Kullanici",
        email: tenant.adminEmail,
        password: TEST_PASSWORD,
      })
      .expect(409);

    expect(await rawPrisma.tenant.count()).toBe(tenantCountBefore);
  });
});

function cookieValue(cookies: string[], name: string): string | undefined {
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match?.split(";")[0]?.split("=")[1];
}

describe("giriş", () => {
  it("doğru bilgilerle giriş yapar ve httpOnly çerez set eder", async () => {
    const response = await supertest(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: tenant.adminEmail, password: TEST_PASSWORD })
      .expect(200);

    const cookies = response.headers["set-cookie"] as unknown as string[];
    const accessCookie = cookies.find((c) => c.startsWith(`${ACCESS_COOKIE}=`));
    const refreshCookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));

    expect(accessCookie).toContain("HttpOnly");
    expect(accessCookie).toContain("SameSite=Lax");
    expect(refreshCookie).toContain("HttpOnly");

    // Şifre hash'i hiçbir koşulda yanıtta olmamalı.
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(response.body.user.email).toBe(tenant.adminEmail);
  });

  it("yanlış şifre ile 401 döner", async () => {
    await supertest(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: tenant.adminEmail, password: "yanlis-sifre-123" })
      .expect(401);
  });

  it("var olmayan e-posta ile AYNI hatayı döner (kullanıcı sayımını engeller)", async () => {
    const unknown = await supertest(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "yok@hicbiryerde.test", password: TEST_PASSWORD })
      .expect(401);

    const wrongPassword = await supertest(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: tenant.adminEmail, password: "yanlis-sifre-123" })
      .expect(401);

    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it("pasif kullanıcı giriş yapamaz", async () => {
    const email = "pasif@auth.test";
    await rawPrisma.user.create({
      data: {
        email,
        fullName: "Pasif",
        // TEST_PASSWORD'ün hash'i yerine mevcut kullanıcının hash'ini kopyalıyoruz.
        passwordHash: (
          await rawPrisma.user.findUniqueOrThrow({ where: { email: tenant.adminEmail } })
        ).passwordHash,
        role: "TENANT_VIEWER",
        tenantId: tenant.tenantId,
        isActive: false,
      },
    });

    await supertest(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email, password: TEST_PASSWORD })
      .expect(401);
  });
});

describe("oturum", () => {
  it("/auth/me giriş yapmış kullanıcıyı döner", async () => {
    const session = await login(tenant.adminEmail);
    const response = await session.request.get("/api/v1/auth/me").expect(200);
    expect(response.body.user.email).toBe(tenant.adminEmail);
  });

  it("çıkıştan sonra refresh token çalışmaz", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: tenant.adminEmail, password: TEST_PASSWORD })
      .expect(200);

    await agent.post("/api/v1/auth/logout").set("Origin", ORIGIN).expect(204);
    await agent.post("/api/v1/auth/refresh").set("Origin", ORIGIN).expect(401);
  });
});

describe("refresh token rotasyonu", () => {
  it("her kullanımda yeni token verir", async () => {
    const agent = supertest.agent(app);
    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: tenant.viewerEmail, password: TEST_PASSWORD })
      .expect(200);

    const first = cookieValue(
      loginResponse.headers["set-cookie"] as unknown as string[],
      REFRESH_COOKIE,
    );

    const refreshResponse = await agent
      .post("/api/v1/auth/refresh")
      .set("Origin", ORIGIN)
      .expect(200);

    const second = cookieValue(
      refreshResponse.headers["set-cookie"] as unknown as string[],
      REFRESH_COOKIE,
    );

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });

  it("kullanılmış token tekrar sunulursa TÜM aile iptal edilir", async () => {
    const agent = supertest.agent(app);
    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: tenant.viewerEmail, password: TEST_PASSWORD })
      .expect(200);

    const stolen = cookieValue(
      loginResponse.headers["set-cookie"] as unknown as string[],
      REFRESH_COOKIE,
    )!;

    // Meşru istemci token'ı bir kez döndürüyor.
    await agent.post("/api/v1/auth/refresh").set("Origin", ORIGIN).expect(200);

    // Saldırgan çalınmış (artık iptal edilmiş) token'ı kullanmayı deniyor.
    await supertest(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `${REFRESH_COOKIE}=${stolen}`)
      .expect(401);

    // Sonuç: meşru istemcinin GEÇERLİ token'ı da artık çalışmaz. Kullanıcı
    // yeniden giriş yapmak zorunda kalır — istenen davranış tam olarak budur.
    await agent.post("/api/v1/auth/refresh").set("Origin", ORIGIN).expect(401);
  });
});

describe("CSRF — Origin allowlist", () => {
  it("izin verilmeyen origin'den gelen POST reddedilir", async () => {
    const session = await login(tenant.adminEmail);

    await session.request
      .post("/api/v1/sites")
      .set("Origin", "https://kotu-site.example")
      .send({ name: "csrf", code: "CSRF-01" })
      .expect(403);
  });

  it("GET istekleri Origin kontrolünden muaftır", async () => {
    const session = await login(tenant.adminEmail);
    await session.request
      .get("/api/v1/sites")
      .set("Origin", "https://kotu-site.example")
      .expect(200);
  });
});
