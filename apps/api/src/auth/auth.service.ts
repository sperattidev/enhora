import { randomUUID } from 'node:crypto';
import type { LoginInput, RegisterCourierInput, RegisterMerchantInput, Role } from '@enhora/shared';
import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthRepository, DuplicateAccountError } from './auth.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { hashRefreshToken, newRefreshToken, TokenService } from './tokens.js';

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: { id: string; email: string; role: Role };
}

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';
const INVALID_SESSION = 'Sesión inválida o vencida';

/** Injection token for the clock, so tests can control time. */
export const CLOCK = Symbol('CLOCK');

@Injectable()
export class AuthService {
  private readonly now: () => Date;

  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
    @Optional() @Inject(CLOCK) now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  async registerMerchant(input: RegisterMerchantInput): Promise<{ userId: string }> {
    const cityId = await this.requireCity(input.citySlug);
    const passwordHash = await hashPassword(input.password);
    return { userId: await this.guardDuplicate(() => this.repo.createMerchantAccount(input, cityId, passwordHash)) };
  }

  async registerCourier(input: RegisterCourierInput): Promise<{ userId: string }> {
    const cityId = await this.requireCity(input.citySlug);
    const passwordHash = await hashPassword(input.password);
    return { userId: await this.guardDuplicate(() => this.repo.createCourierAccount(input, cityId, passwordHash)) };
  }

  async login(input: LoginInput, client: ClientInfo): Promise<IssuedTokens> {
    const user = await this.repo.findUserByEmail(input.email);
    const valid = await verifyPassword(user?.passwordHash ?? null, input.password);
    // Same message for unknown email, wrong password and suspended account: no account enumeration.
    if (!user || !valid || user.status !== 'ACTIVE') throw new UnauthorizedException(INVALID_CREDENTIALS);

    await this.repo.recordLogin(user.id);
    return this.issue(user, randomUUID(), client);
  }

  /**
   * Rotates a refresh token. Reusing an already rotated token revokes the whole session family,
   * which logs out both the attacker and the legitimate user.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<IssuedTokens> {
    const tokenHash = hashRefreshToken(refreshToken);
    const now = this.now();
    const session = await this.repo.consumeSession(tokenHash, now);

    if (!session) {
      const known = await this.repo.findSession(tokenHash);
      if (known) await this.repo.revokeFamily(known.familyId, now);
      throw new UnauthorizedException(INVALID_SESSION);
    }
    if (session.expiresAt <= now) throw new UnauthorizedException(INVALID_SESSION);

    const user = await this.repo.findUserById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.repo.revokeFamily(session.familyId, now);
      throw new UnauthorizedException(INVALID_SESSION);
    }
    return this.issue(user, session.familyId, client);
  }

  async logout(refreshToken: string): Promise<void> {
    const now = this.now();
    const session = await this.repo.findSession(hashRefreshToken(refreshToken));
    if (session) await this.repo.revokeFamily(session.familyId, now);
  }

  private async issue(
    user: { id: string; email: string; role: Role },
    familyId: string,
    client: ClientInfo,
  ): Promise<IssuedTokens> {
    const refreshToken = newRefreshToken();
    const refreshExpiresAt = new Date(this.now().getTime() + this.tokens.refreshTtlMs);
    await this.repo.createSession({
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiresAt,
      ip: client.ip,
      userAgent: client.userAgent?.slice(0, 300) ?? null,
    });
    return {
      accessToken: await this.tokens.signAccess({ userId: user.id, role: user.role }),
      expiresIn: this.tokens.accessTtlSeconds,
      refreshToken,
      refreshExpiresAt,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  private async requireCity(slug: string): Promise<string> {
    const cityId = await this.repo.findActiveCityId(slug);
    if (!cityId) throw new UnprocessableEntityException('Todavía no operamos en esa ciudad');
    return cityId;
  }

  private async guardDuplicate(run: () => Promise<string>): Promise<string> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof DuplicateAccountError) throw new ConflictException('Ya existe una cuenta con esos datos');
      throw error;
    }
  }
}
