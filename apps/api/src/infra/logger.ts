import pino from "pino";
import { env, isProduction, isTest } from "../config/env.js";

/**
 * Tek logger örneği. İstek bazlı alt logger'lar requestContext middleware'i
 * tarafından `req.log` üzerine bağlanır, böylece her satır requestId taşır.
 */
export const logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  // Prod'da JSON (log toplayıcılar için), dev'de insan okuyabilir çıktı.
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
      },
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.headers['x-api-key']",
      "*.password",
      "*.passwordHash",
      "*.apiKey",
      "*.token",
    ],
    censor: "[gizlendi]",
  },
});

export type Logger = typeof logger;
