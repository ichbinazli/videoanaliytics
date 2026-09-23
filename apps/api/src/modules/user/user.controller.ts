import type { Request, Response } from "express";
import type { UserService, Actor } from "./user.service.js";
import type { CreateUserDto, UpdateUserDto, userListQuerySchema } from "./user.dto.js";
import type { z } from "zod";

function actorOf(req: Request): Actor {
  const auth = req.auth!;
  return { userId: auth.userId, tenantId: auth.tenantId, role: auth.role };
}

export class UserController {
  constructor(private readonly service: UserService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as z.infer<typeof userListQuerySchema>;
    res.json(await this.service.list(query));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    res.json({ user: await this.service.getById(Number(req.params.id)) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const user = await this.service.create(req.body as CreateUserDto, actorOf(req));
    res.status(201).json({ user });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const user = await this.service.update(
      Number(req.params.id),
      req.body as UpdateUserDto,
      actorOf(req),
    );
    res.json({ user });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.delete(Number(req.params.id), actorOf(req));
    res.status(204).end();
  };
}
