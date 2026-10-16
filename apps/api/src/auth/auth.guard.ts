import type { Role } from '@enhora/shared';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedRequest, IS_PUBLIC, ROLES_KEY } from './decorators.js';
import { TokenService } from './tokens.js';

/** Global guard: authenticates every non-public route and enforces @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    const claims = scheme === 'Bearer' && token ? await this.tokens.verifyAccess(token) : null;
    if (!claims) throw new UnauthorizedException('Necesitás iniciar sesión');
    req.auth = claims;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(claims.role)) throw new ForbiddenException('No tenés permiso para esto');
    return true;
  }
}
