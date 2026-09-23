import type { CookieOptions, Response } from "express";
import { env } from "../../config/env.js";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../config/constants.js";

/**
 * Token'lar neden çerezde, localStorage'da değil?
 * Panel bir tarayıcı uygulaması; localStorage'daki bir token XSS ile
 * okunabilir. httpOnly çerez JavaScript'e görünmez.
 *
 * Path neden "/"? Panel, Express'i kendi origin'i altında `/backend/*` yoluna
 * rewrite ediyor. Tarayıcının gördüğü yol `/backend/...` olduğu için çerezi
 * `/api/v1/auth` yoluna kısıtlamak onu hiç göndermemekle sonuçlanırdı.
 */
function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // Lax: normal gezinmede gider, üçüncü taraf POST'larında gitmez.
    // originCheck middleware'i ile birlikte CSRF için yeterli.
    sameSite: "lax",
    path: "/",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setSessionCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookieOptions(),
    // Access token'a expires vermiyoruz: JWT'nin kendi `exp`'i otoritedir.
    // Çerez oturum boyu kalsın, süresi dolan token zaten reddedilir.
  });

  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions(),
    expires: tokens.refreshExpiresAt,
  });
}

export function clearSessionCookies(res: Response): void {
  const options = baseCookieOptions();
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}
