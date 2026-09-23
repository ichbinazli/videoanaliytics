import type { Request, Response } from "express";
import { REFRESH_COOKIE } from "../../config/constants.js";
import { UnauthorizedError } from "../../errors/httpErrors.js";
import type { UserRepository } from "../../repositories/user.repository.js";
import type { AuthService } from "./auth.service.js";
import type { ChangePasswordDto, LoginDto, RegisterDto } from "./auth.dto.js";
import { clearSessionCookies, setSessionCookies } from "./auth.cookies.js";

/**
 * Controller sadece HTTP bilir: gövdeyi alır (zaten doğrulanmış), servisi
 * çağırır, çerezi ve yanıtı yazar. İş kuralı burada YOKTUR.
 *
 * Metotlar arrow property: router'a referans olarak geçtiğimizde `this`
 * bağlantısı kopmasın diye.
 */
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly users: UserRepository,
  ) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const session = await this.service.login(req.body as LoginDto);
    setSessionCookies(res, session);
    res.json({ user: session.user });
  };

  register = async (req: Request, res: Response): Promise<void> => {
    const session = await this.service.register(req.body as RegisterDto);
    setSessionCookies(res, session);
    res.status(201).json({ user: session.user });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;

    if (!token) {
      throw new UnauthorizedError("Oturum bulunamadı.");
    }

    const session = await this.service.refresh(token);
    setSessionCookies(res, session);
    res.json({ user: session.user });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.service.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearSessionCookies(res);
    res.status(204).end();
  };

  me = async (req: Request, res: Response): Promise<void> => {
    // jwtAuth middleware'i buraya gelindiğinde req.auth'u doldurmuş olur.
    const auth = req.auth!;
    const user = await this.users.findActiveById(auth.userId);

    if (!user) {
      throw new UnauthorizedError("Hesap artık aktif değil.");
    }

    res.json({ user });
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    await this.service.changePassword(req.auth!.userId, req.body as ChangePasswordDto);
    // Tüm oturumlar düştü; bu isteğin çerezleri de temizlensin.
    clearSessionCookies(res);
    res.status(204).end();
  };
}
