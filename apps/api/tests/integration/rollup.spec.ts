import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildContainer } from "../../src/container.js";
import { runAsTenant } from "../../src/infra/tenantContext.js";
import { rawPrisma, seedTenant, truncateAll, type SeededTenant } from "../helpers/db.js";
import { floorToUtcHour } from "../../src/utils/time.js";

/**
 * Rollup job'ının sözleşmesi tek cümle: kaç kez çalıştırılırsa çalıştırılsın
 * sonuç aynıdır. Bu dosya o cümleyi kanıtlar.
 */

const container = buildContainer();
let tenant: SeededTenant;

/** Belirli bir saate düşen ham oturumlar üretir. */
async function insertSessions(
  target: SeededTenant,
  bucketStart: Date,
  rows: Array<{
    minute: number;
    passed: number;
    looked: number;
    lookingSeconds: number;
    age: number | null;
    gender: "MALE" | "FEMALE" | "UNKNOWN";
    emotion: "HAPPY" | "SAD" | "NEUTRAL" | "UNKNOWN";
  }>,
): Promise<void> {
  await rawPrisma.viewerSession.createMany({
    data: rows.map((row) => {
      const startedAt = new Date(bucketStart.getTime() + row.minute * 60_000);
      return {
        sessionUuid: randomUUID(),
        tenantId: target.tenantId,
        siteId: target.siteId,
        deviceId: target.deviceId,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 20_000),
        durationSec: 20,
        personsPassed: row.passed,
        personsLooked: row.looked,
        lookingSeconds: row.lookingSeconds,
        ageEstimate: row.age,
        ageBucket: row.age === null ? "UNKNOWN" : row.age < 25 ? "YOUTH" : "ADULT",
        gender: row.gender,
        emotion: row.emotion,
      };
    }),
  });

  await rawPrisma.rollupDirtyBucket.createMany({
    data: [{ deviceId: target.deviceId, bucketStart }],
    skipDuplicates: true,
  });
}

const BUCKET = floorToUtcHour(new Date("2026-05-14T10:30:00.000Z"));

beforeAll(async () => {
  await truncateAll();
  tenant = await seedTenant("rollup");
});

beforeEach(async () => {
  await rawPrisma.viewerSession.deleteMany();
  await rawPrisma.sessionRollupHourly.deleteMany();
  await rawPrisma.demographicRollupDaily.deleteMany();
  await rawPrisma.rollupDirtyBucket.deleteMany();
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

describe("saatlik rollup", () => {
  it("ham satırlardan doğru toplamları üretir", async () => {
    await insertSessions(tenant, BUCKET, [
      { minute: 1, passed: 3, looked: 2, lookingSeconds: 10, age: 30, gender: "MALE", emotion: "HAPPY" },
      { minute: 5, passed: 2, looked: 1, lookingSeconds: 5.5, age: 20, gender: "FEMALE", emotion: "SAD" },
      { minute: 9, passed: 1, looked: 0, lookingSeconds: 0, age: null, gender: "UNKNOWN", emotion: "UNKNOWN" },
    ]);

    await container.jobs.rollup.run();

    const rollup = await rawPrisma.sessionRollupHourly.findFirstOrThrow();
    expect(rollup.sessionCount).toBe(3);
    expect(rollup.personsPassed).toBe(6);
    expect(rollup.personsLooked).toBe(3);
    expect(Number(rollup.lookingSeconds)).toBeCloseTo(15.5, 1);
    // Ortalama yaş = ageSum / ageCount; yaşı olmayan satır sayıya girmez.
    expect(rollup.ageSum).toBe(50);
    expect(rollup.ageCount).toBe(2);
    expect(rollup.emHappy).toBe(1);
    expect(rollup.emSad).toBe(1);
    expect(rollup.emUnknown).toBe(1);
  });

  it("işlenen kovayı kuyruktan siler", async () => {
    await insertSessions(tenant, BUCKET, [
      { minute: 1, passed: 1, looked: 1, lookingSeconds: 3, age: 30, gender: "MALE", emotion: "HAPPY" },
    ]);

    expect(await rawPrisma.rollupDirtyBucket.count()).toBe(1);
    await container.jobs.rollup.run();
    expect(await rawPrisma.rollupDirtyBucket.count()).toBe(0);
  });

  it("İDEMPOTENT: iki kez çalıştırınca birebir aynı satır kalır", async () => {
    await insertSessions(tenant, BUCKET, [
      { minute: 1, passed: 3, looked: 2, lookingSeconds: 10, age: 30, gender: "MALE", emotion: "HAPPY" },
      { minute: 5, passed: 2, looked: 1, lookingSeconds: 5.5, age: 20, gender: "FEMALE", emotion: "SAD" },
    ]);

    await container.jobs.rollup.run();
    const first = await rawPrisma.sessionRollupHourly.findFirstOrThrow();

    // Kovayı tekrar kirli işaretleyip yeniden çalıştır.
    await rawPrisma.rollupDirtyBucket.create({
      data: { deviceId: tenant.deviceId, bucketStart: BUCKET },
    });
    await container.jobs.rollup.run();

    const second = await rawPrisma.sessionRollupHourly.findFirstOrThrow();

    // Sayaç ARTMAMALI — bu, "yeniden hesapla" ile "artır" arasındaki farkın
    // ta kendisi ve cihaz retry'larının raporlara sızmamasının sebebi.
    expect(second.sessionCount).toBe(first.sessionCount);
    expect(second.personsPassed).toBe(first.personsPassed);
    expect(second.personsLooked).toBe(first.personsLooked);
    expect(Number(second.lookingSeconds)).toBe(Number(first.lookingSeconds));
    expect(await rawPrisma.sessionRollupHourly.count()).toBe(1);
  });

  it("silinen rollup satırı yeniden çalıştırınca aynen geri gelir", async () => {
    await insertSessions(tenant, BUCKET, [
      { minute: 1, passed: 4, looked: 3, lookingSeconds: 12.5, age: 40, gender: "MALE", emotion: "NEUTRAL" },
    ]);
    await container.jobs.rollup.run();
    const before = await rawPrisma.sessionRollupHourly.findFirstOrThrow();

    await rawPrisma.sessionRollupHourly.deleteMany();
    await rawPrisma.rollupDirtyBucket.create({
      data: { deviceId: tenant.deviceId, bucketStart: BUCKET },
    });
    await container.jobs.rollup.run();

    const after = await rawPrisma.sessionRollupHourly.findFirstOrThrow();
    expect(after.personsPassed).toBe(before.personsPassed);
    expect(Number(after.lookingSeconds)).toBe(Number(before.lookingSeconds));
  });

  it("ham satırlar silinmişse rollup satırı da temizlenir", async () => {
    await insertSessions(tenant, BUCKET, [
      { minute: 1, passed: 1, looked: 1, lookingSeconds: 2, age: 30, gender: "MALE", emotion: "HAPPY" },
    ]);
    await container.jobs.rollup.run();
    expect(await rawPrisma.sessionRollupHourly.count()).toBe(1);

    // Retention sildi ya da veri düzeltildi.
    await rawPrisma.viewerSession.deleteMany();
    await rawPrisma.rollupDirtyBucket.create({
      data: { deviceId: tenant.deviceId, bucketStart: BUCKET },
    });
    await container.jobs.rollup.run();

    // Panelde hayalet veri kalmamalı.
    expect(await rawPrisma.sessionRollupHourly.count()).toBe(0);
  });

  it("geç gelen veri eski kovayı düzeltir", async () => {
    // Cihaz 3 gün offline kaldı; kuyruğunu şimdi boşaltıyor.
    const oldBucket = floorToUtcHour(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));

    await insertSessions(tenant, oldBucket, [
      { minute: 1, passed: 2, looked: 1, lookingSeconds: 4, age: 30, gender: "MALE", emotion: "HAPPY" },
    ]);
    await container.jobs.rollup.run();
    expect((await rawPrisma.sessionRollupHourly.findFirstOrThrow()).sessionCount).toBe(1);

    // Aynı saate ait ikinci parti geliyor.
    await insertSessions(tenant, oldBucket, [
      { minute: 30, passed: 5, looked: 4, lookingSeconds: 20, age: 50, gender: "FEMALE", emotion: "SAD" },
    ]);
    await container.jobs.rollup.run();

    const rollup = await rawPrisma.sessionRollupHourly.findFirstOrThrow();
    expect(rollup.sessionCount).toBe(2);
    expect(rollup.personsPassed).toBe(7);
  });
});

describe("günlük demografi rollup'ı", () => {
  it("cinsiyet ve yaş kırılımını üretir", async () => {
    await insertSessions(tenant, BUCKET, [
      { minute: 1, passed: 1, looked: 1, lookingSeconds: 5, age: 30, gender: "MALE", emotion: "HAPPY" },
      { minute: 2, passed: 1, looked: 1, lookingSeconds: 7, age: 35, gender: "MALE", emotion: "HAPPY" },
      { minute: 3, passed: 1, looked: 1, lookingSeconds: 3, age: 20, gender: "FEMALE", emotion: "SAD" },
    ]);

    await container.jobs.rollup.run();

    const rows = await rawPrisma.demographicRollupDaily.findMany({
      orderBy: [{ gender: "asc" }, { ageBucket: "asc" }],
    });

    const male = rows.find((row) => row.gender === "MALE" && row.ageBucket === "ADULT");
    const female = rows.find((row) => row.gender === "FEMALE" && row.ageBucket === "YOUTH");

    expect(male?.sessionCount).toBe(2);
    expect(Number(male?.lookingSeconds)).toBeCloseTo(12, 1);
    expect(female?.sessionCount).toBe(1);
  });

  it("İDEMPOTENT: tekrar çalıştırınca satırlar ikiye katlanmaz", async () => {
    await insertSessions(tenant, BUCKET, [
      { minute: 1, passed: 1, looked: 1, lookingSeconds: 5, age: 30, gender: "MALE", emotion: "HAPPY" },
    ]);

    await container.jobs.rollup.run();
    const firstCount = await rawPrisma.demographicRollupDaily.count();

    await rawPrisma.rollupDirtyBucket.create({
      data: { deviceId: tenant.deviceId, bucketStart: BUCKET },
    });
    await container.jobs.rollup.run();

    expect(await rawPrisma.demographicRollupDaily.count()).toBe(firstCount);
  });
});

describe("tenant izolasyonu — rollup okumaları", () => {
  it("bir tenant diğerinin agregatını göremez", async () => {
    const other = await seedTenant("rollupother");

    await insertSessions(tenant, BUCKET, [
      { minute: 1, passed: 10, looked: 8, lookingSeconds: 40, age: 30, gender: "MALE", emotion: "HAPPY" },
    ]);
    await insertSessions(other, BUCKET, [
      { minute: 1, passed: 99, looked: 99, lookingSeconds: 999, age: 30, gender: "MALE", emotion: "HAPPY" },
    ]);

    await container.jobs.rollup.run();

    const mine = await runAsTenant(tenant.tenantId, () =>
      container.repositories.rollups.totals({
        from: new Date(BUCKET.getTime() - 3600_000),
        to: new Date(BUCKET.getTime() + 3600_000),
      }),
    );

    expect(mine.passed).toBe(10);
    expect(mine.looked).toBe(8);
  });
});
