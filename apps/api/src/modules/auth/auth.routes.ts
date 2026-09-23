import { Router } from "express";
import { jwtAuth } from "../../middleware/jwtAuth.middleware.js";
import { loginRateLimit } from "../../middleware/rateLimit.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import type { AuthController } from "./auth.controller.js";
import { changePasswordSchema, loginSchema, registerSchema } from "./auth.dto.js";

/**
 * Auth route'ları tenantScope'un DIŞINDA kalır: login sırasında henüz bir
 * tenant yoktur, /me ve /refresh ise tenant'a ait tabloya dokunmaz.
 */
export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  router.post("/register", validate(registerSchema), loginRateLimit, controller.register);
  router.post("/login", validate(loginSchema), loginRateLimit, controller.login);
  router.post("/refresh", controller.refresh);
  router.post("/logout", controller.logout);

  router.get("/me", jwtAuth, controller.me);
  router.post(
    "/change-password",
    jwtAuth,
    validate(changePasswordSchema),
    controller.changePassword,
  );

  return router;
}
