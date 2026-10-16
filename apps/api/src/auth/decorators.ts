import type { Role } from '@enhora/shared';
import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AccessClaims } from './tokens.js';

export const IS_PUBLIC = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** Opts a route out of authentication. Every other route requires a valid access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export type AuthenticatedRequest = FastifyRequest & { auth?: AccessClaims };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessClaims => {
  const auth = ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  if (!auth) throw new Error('CurrentUser used on a public route');
  return auth;
});
