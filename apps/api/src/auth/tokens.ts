import { createHash, randomBytes } from 'node:crypto';
import { ROLES, type Role } from '@enhora/shared';
import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { ENV, type Env } from '../config/env.js';

const ISSUER = 'enhora';
const AUDIENCE = 'enhora-api';

export interface AccessClaims {
  userId: string;
  role: Role;
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  get accessTtlSeconds(): number {
    return this.env.ACCESS_TOKEN_TTL_SECONDS;
  }

  get refreshTtlMs(): number {
    return this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.key);
  }

  /** Returns the claims, or null for any invalid, expired or tampered token. */
  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || !ROLES.includes(payload.role as Role)) return null;
      return { userId: payload.sub, role: payload.role as Role };
    } catch {
      return null;
    }
  }
}
