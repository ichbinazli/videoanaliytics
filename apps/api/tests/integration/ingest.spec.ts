import { randomUUID } from "node:crypto";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../helpers/agent.js";
import { rawPrisma, seedTenant, truncateAll, type SeededTenant } from "../helpers/db.js";
import { API_KEY_HEADER } from "../../src/config/constants.js";

let alfa: SeededTenant;
let beta: SeededTenant;

beforeAll(async () => {
  await truncateAll();
  alfa = await seedTenant("ingalfa");
  beta = await seedTenant("ingbeta");
});

beforeEach(async () => {
  await rawPrisma.viewerSession.deleteMany();
  await rawPrisma.rollupDirtyBucket.deleteMany();
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

function makeSession(overrides: Record<string, unknown> = {}) {
  const startedAt = new Date(Date.now() - 60_000);
  return {
    sessionUuid: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + 29_000).toISOString(),
    durationSec: 29,
    personsPassed: 3,
    personsLooked: 2,
    lookingSeconds: 18.4,
    ageEstimate: 31,
    ageBucketRaw: "Yetişkin",
    gender: "Man",
    emotion: "happy",
    ...overrides,
  };
}

function batch(sessions: unknown[], device: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    sentAt: new Date().toISOString(),
    device: { appVersion: "0.1.0", spoolDepth: 0, ...device },
    sessions,
  };
}

function post(apiKey: string, body: unknown) {
  return supertest(app)
    .post("/ingest/v1/sessions")
    .set(API_KEY_HEADER, apiKey)
    .send(body);
}

describe("cihaz kimlik doğrulama", () => {
  it("API key'siz istek 401 döner", async () => {
    await supertest(app).post("/ingest/v1/sessions").send(batch([makeSession()])).expect(401);
  });

  it("bozuk formatlı key 401 döner", async () => {
    await post("bozuk-bir-deger", batch([makeSession()])).expect(401);
  });

  it("secret'ında alt çizgi olan key kabul edilir", async () => {
    // Regresyon testi: secret base64url olduğu için `_` içerebiliyor ve
    // ayrıştırıcı bir zamanlar tam olarak bu key'leri reddediyordu.
    const seed = await seedTenant("ingunderscore");
    let key = seed.apiKey;

    // Rastgeleliğe bel bağlamamak için içinde `_` olan bir key bulana kadar üret.
    for (let attempt = 0; attempt < 50 && !key.split("_").slice(2).join("").includes("_"); ) {
      attempt += 1;
      const { generateApiKey } = await import("../../src/security/apiKey.js");
      const generated = generateApiKey();
      if (generated.plaintext.split("_").length > 3) {
        await rawPrisma.deviceApiKey.updateMany({
          where: { deviceId: seed.deviceId },
          data: { keyPrefix: generated.prefix, keyHash: generated.hash },
        });
        key = generated.plaintext;
        break;
      }
    }

    await post(key, batch([makeSession()])).expect(202);
  });

  it("doğru prefix + yanlış secret 401 döner", async () => {
    const [scheme, prefix] = alfa.apiKey.split("_");
    await post(`${scheme}_${prefix}_yanlissecretyanlissecret`, batch([makeSession()])).expect(
      401,
    );
  });

  it("iptal edilmiş key 401 döner", async () => {
    const seed = await seedTenant("ingrevoked");
    await rawPrisma.deviceApiKey.updateMany({
      where: { deviceId: seed.deviceId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    await post(seed.apiKey, batch([makeSession()])).expect(401);
  });
});

describe("oturum yükleme", () => {
  it("batch'i kabul eder ve 202 döner", async () => {
    const sessions = [makeSession(), makeSession(), makeSession()];
    const response = await post(alfa.apiKey, batch(sessions)).expect(202);

    expect(response.body).toMatchObject({ accepted: 3, duplicates: 0, rejected: [] });
    expect(await rawPrisma.viewerSession.count()).toBe(3);
  });

  it("aynı batch tekrar gönderilirse hiçbir satır eklenmez", async () => {
    const sessions = [makeSession(), makeSession(), makeSession()];
    const payload = batch(sessions);

    const first = await post(alfa.apiKey, payload).expect(202);
    expect(first.body).toMatchObject({ accepted: 3, duplicates: 0 });

    const second = await post(alfa.apiKey, payload).expect(202);
    expect(second.body).toMatchObject({ accepted: 0, duplicates: 3 });

    // Asıl kanıt: satır sayısı hâlâ 3.
    expect(await rawPrisma.viewerSession.count()).toBe(3);
  });

  it("cihaz kimliği API key'den gelir — kayıtlar o cihaza yazılır", async () => {
    await post(alfa.apiKey, batch([makeSession()])).expect(202);

    const row = await rawPrisma.viewerSession.findFirstOrThrow();
    expect(row.deviceId).toBe(alfa.deviceId);
    expect(row.tenantId).toBe(alfa.tenantId);
    expect(row.siteId).toBe(alfa.siteId);
  });

  it("iki tenant aynı sessionUuid'yi kullanabilir — tekillik cihaz bazlıdır", async () => {
    const shared = makeSession();

    await post(alfa.apiKey, batch([shared])).expect(202);
    const second = await post(beta.apiKey, batch([shared])).expect(202);

    expect(second.body.accepted).toBe(1);
    expect(await rawPrisma.viewerSession.count()).toBe(2);
  });
});

describe("normalizasyon", () => {
  it("ham DeepFace etiketlerini enum'lara çevirir", async () => {
    await post(
      alfa.apiKey,
      batch([makeSession({ gender: "Woman", emotion: "sad", ageEstimate: 8 })]),
    ).expect(202);

    const row = await rawPrisma.viewerSession.findFirstOrThrow();
    expect(row.gender).toBe("FEMALE");
    expect(row.emotion).toBe("SAD");
    expect(row.ageBucket).toBe("CHILD");
    expect(row.ageEstimate).toBe(8);
  });

  it("yaş kovasını SUNUCUDA türetir — cihazın gönderdiği kovaya güvenmez", async () => {
    // Cihaz "Çocuk" diyor ama sayısal yaş 70; sunucu sayısal değeri esas alır.
    await post(
      alfa.apiKey,
      batch([makeSession({ ageEstimate: 70, ageBucketRaw: "Çocuk" })]),
    ).expect(202);

    const row = await rawPrisma.viewerSession.findFirstOrThrow();
    expect(row.ageBucket).toBe("SENIOR");
  });

  it("sayısal yaş yoksa Türkçe kova adına düşer", async () => {
    await post(
      alfa.apiKey,
      batch([makeSession({ ageEstimate: null, ageBucketRaw: "Orta Yaşlı" })]),
    ).expect(202);

    const row = await rawPrisma.viewerSession.findFirstOrThrow();
    expect(row.ageBucket).toBe("MIDDLE_AGED");
    expect(row.ageEstimate).toBeNull();
  });

  it("tanınmayan etiketler UNKNOWN olur, hata vermez", async () => {
    await post(
      alfa.apiKey,
      batch([makeSession({ gender: "Bilinmiyor", emotion: "kafası karışık" })]),
    ).expect(202);

    const row = await rawPrisma.viewerSession.findFirstOrThrow();
    expect(row.gender).toBe("UNKNOWN");
    expect(row.emotion).toBe("UNKNOWN");
  });
});

describe("saat kayması penceresi", () => {
  it("çok eski kaydı reddeder ama batch'i düşürmez", async () => {
    const old = makeSession({
      startedAt: new Date("1970-01-01T00:00:00Z").toISOString(),
      endedAt: new Date("1970-01-01T00:00:29Z").toISOString(),
    });
    const good = makeSession();

    const response = await post(alfa.apiKey, batch([old, good])).expect(202);

    expect(response.body.accepted).toBe(1);
    expect(response.body.rejected).toEqual([
      { sessionUuid: old.sessionUuid, reason: "TIMESTAMP_OUT_OF_WINDOW" },
    ]);
    expect(await rawPrisma.viewerSession.count()).toBe(1);
  });

  it("çok ileri tarihli kaydı reddeder", async () => {
    const future = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    const response = await post(
      alfa.apiKey,
      batch([
        makeSession({
          startedAt: future.toISOString(),
          endedAt: new Date(future.getTime() + 1000).toISOString(),
        }),
      ]),
    ).expect(202);

    expect(response.body.rejected[0].reason).toBe("TIMESTAMP_OUT_OF_WINDOW");
  });

  it("bitişi başlangıcından önce olan kaydı reddeder", async () => {
    const start = new Date();
    const response = await post(
      alfa.apiKey,
      batch([
        makeSession({
          startedAt: start.toISOString(),
          endedAt: new Date(start.getTime() - 5000).toISOString(),
        }),
      ]),
    ).expect(202);

    expect(response.body.rejected[0].reason).toBe("END_BEFORE_START");
  });
});

describe("rollup kuyruğu", () => {
  it("etkilenen saat kovalarını işaretler", async () => {
    const hour = new Date();
    hour.setUTCMinutes(10, 0, 0);

    await post(
      alfa.apiKey,
      batch([
        makeSession({
          startedAt: hour.toISOString(),
          endedAt: new Date(hour.getTime() + 5000).toISOString(),
        }),
      ]),
    ).expect(202);

    const dirty = await rawPrisma.rollupDirtyBucket.findMany();
    expect(dirty).toHaveLength(1);
    expect(dirty[0]!.deviceId).toBe(alfa.deviceId);
    expect(dirty[0]!.bucketStart.getUTCMinutes()).toBe(0);
  });

  it("aynı saatteki çok sayıda oturum tek kova üretir", async () => {
    const hour = new Date();
    hour.setUTCMinutes(5, 0, 0);

    await post(
      alfa.apiKey,
      batch(
        [0, 1, 2, 3].map((index) =>
          makeSession({
            startedAt: new Date(hour.getTime() + index * 60_000).toISOString(),
            endedAt: new Date(hour.getTime() + index * 60_000 + 5_000).toISOString(),
          }),
        ),
      ),
    ).expect(202);

    expect(await rawPrisma.rollupDirtyBucket.count()).toBe(1);
  });
});

describe("doğrulama ve limitler", () => {
  it("geçersiz gövde 400 döner", async () => {
    const response = await post(alfa.apiKey, { schemaVersion: 1, sessions: [] }).expect(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("batch limitini aşan istek 400 döner", async () => {
    const tooMany = Array.from({ length: 501 }, () => makeSession());
    await post(alfa.apiKey, batch(tooMany)).expect(400);
  });

  it("heartbeat cihazın son görülme zamanını günceller", async () => {
    await supertest(app)
      .post("/ingest/v1/heartbeat")
      .set(API_KEY_HEADER, alfa.apiKey)
      .send({ appVersion: "0.2.0", spoolDepth: 42 })
      .expect(200);

    const device = await rawPrisma.device.findUniqueOrThrow({
      where: { id: alfa.deviceId },
    });
    expect(device.appVersion).toBe("0.2.0");
    expect(device.lastSpoolDepth).toBe(42);
    expect(device.lastSeenAt).not.toBeNull();
  });
});
