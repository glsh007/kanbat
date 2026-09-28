import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { User } from '../store/types';
import { AuthService } from './auth.service';

const PUBLIC = 'kanbat:public';
const SPECIALIST = 'kanbat:specialist';
const ADMIN = 'kanbat:admin';

/** Доступно без входа. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Только для специалистов поддержки. */
export const SpecialistOnly = () => SetMetadata(SPECIALIST, true);
/** Только для администратора организации (специалист, вошедший с кодом администратора). */
export const AdminOnly = () => SetMetadata(ADMIN, true);

export const isAdmin = (u: User) => u.role === 'specialist' && u.admin === true;

type AuthedRequest = Request & { user?: User; token?: string };

export function bearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
}

/** Проверяет токен из заголовка Authorization: Bearer … и кладёт пользователя в запрос. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    const user = await this.auth.userByToken(token);
    if (!user) throw new UnauthorizedException('Войдите заново');
    if (
      this.reflector.getAllAndOverride<boolean>(SPECIALIST, targets) &&
      user.role !== 'specialist'
    )
      throw new ForbiddenException('Только для специалистов поддержки');
    if (this.reflector.getAllAndOverride<boolean>(ADMIN, targets) && !isAdmin(user))
      throw new ForbiddenException('Только для администратора организации');
    req.user = user;
    req.token = token;
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user!,
);
export const CurrentToken = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().token!,
);
