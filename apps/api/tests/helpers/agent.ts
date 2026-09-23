import supertest from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { TEST_PASSWORD } from "./db.js";

/**
 * createApp() gerçek bir soket açmaz; supertest doğrudan uygulamaya konuşur.
 * Bu yüzden test dosyaları port çakışması yaşamaz.
 */
export const app: Express = createApp();

export type Session = {
  cookies: string[];
  request: supertest.Agent;
};

/** Giriş yapıp oturum çerezlerini taşıyan bir istemci döner. */
export async function login(email: string): Promise<Session> {
  const agent = supertest.agent(app);

  const response = await agent
    .post("/api/v1/auth/login")
    .set("Origin", "http://localhost:3000")
    .send({ email, password: TEST_PASSWORD })
    .expect(200);

  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : [];

  return { cookies, request: agent };
}

/** Origin başlığı olmadan POST/PATCH/DELETE atmak originCheck'e takılır. */
export const ORIGIN = "http://localhost:3000";
