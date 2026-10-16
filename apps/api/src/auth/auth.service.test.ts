import type { RegisterMerchantInput } from '@enhora/shared';
import { ConflictException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import {
  type AccountView,
  AuthRepository,
  DuplicateAccountError,
  type NewSession,
  type SessionRecord,
  type UserRecord,
} from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';
import { hashRefreshToken, TokenService } from './tokens.js';

class InMemoryAuthRepository extends AuthRepository {
  users = new Map<string, UserRecord>();
  sessions = new Map<string, SessionRecord & { tokenHash: string }>();
  emails = new Set<string>();

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }
  async findAccount(): Promise<AccountView | null> {
    return null;
  }
  async findActiveCityId(slug: string) {
    return slug === 'firmat' ? 'city-firmat' : null;
  }
  async createMerchantAccount(input: RegisterMerchantInput, _cityId: string, passwordHash: string) {
    if (this.emails.has(input.email)) throw new DuplicateAccountError();
    this.emails.add(input.email);
    const id = `user-${this.users.size + 1}`;
    this.users.set(id, { id, email: input.email, passwordHash, role: 'MERCHANT', status: 'ACTIVE' });
    return id;
  }
  async createCourierAccount(): Promise<string> {
    throw new Error('not used');
  }
  async recordLogin() {}
  async createSession(s: NewSession) {
    this.sessions.set(s.tokenHash, {
      id: `s-${this.sessions.size + 1}`,
      userId: s.userId,
      familyId: s.familyId,
      expiresAt: s.expiresAt,
      revokedAt: null,
      tokenHash: s.tokenHash,
    });
  }
  async consumeSession(tokenHash: string, now: Date) {
    const s = this.sessions.get(tokenHash);
    if (!s || s.revokedAt) return null;
    s.revokedAt = now;
    return { ...s };
  }
  async findSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }
  async revokeFamily(familyId: string, now: Date) {
    for (const s of this.sessions.values()) if (s.familyId === familyId && !s.revokedAt) s.revokedAt = now;
  }
  activeSessions() {
    return [...this.sessions.values()].filter((s) => !s.revokedAt);
  }
}

const env = loadEnv({ DATABASE_URL: 'postgres://localhost/test', JWT_ACCESS_SECRET: 'x'.repeat(32) });
const client = { ip: '127.0.0.1', userAgent: 'vitest' };

const merchantInput: RegisterMerchantInput = {
  email: 'pedidos@laesquina.com',
  password: 'una-clave-larga',
  phone: '+5493465123456',
  citySlug: 'firmat',
  legalName: 'La Esquina SRL',
  displayName: 'La Esquina',
  cuit: '20123456786',
  address: 'Belgrano 1200',
  location: { lat: -33.4594, lng: -61.4832 },
};

describe('AuthService', () => {
  let repo: InMemoryAuthRepository;
  let tokens: TokenService;
  let now: Date;
  let service: AuthService;

  beforeEach(() => {
    repo = new InMemoryAuthRepository();
    tokens = new TokenService(env);
    now = new Date('2026-10-15T12:00:00Z');
    service = new AuthService(repo, tokens, () => now);
  });

  it('registers a merchant with a hashed password', async () => {
    const { userId } = await service.registerMerchant(merchantInput);
    const user = repo.users.get(userId)!;
    expect(user.passwordHash).not.toContain(merchantInput.password);
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('rejects cities where the platform does not operate', async () => {
    await expect(service.registerMerchant({ ...merchantInput, citySlug: 'rosario' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('reports duplicates as a conflict', async () => {
    await service.registerMerchant(merchantInput);
    await expect(service.registerMerchant(merchantInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in and issues a verifiable access token', async () => {
    await service.registerMerchant(merchantInput);
    const issued = await service.login({ email: merchantInput.email, password: merchantInput.password }, client);
    expect(await tokens.verifyAccess(issued.accessToken)).toMatchObject({ role: 'MERCHANT' });
    expect(repo.activeSessions()).toHaveLength(1);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    await service.registerMerchant(merchantInput);
    await expect(service.login({ email: 'nadie@x.com', password: 'loquesea-123' }, client)).rejects.toThrow(
      'Email o contraseña incorrectos',
    );
    await expect(service.login({ email: merchantInput.email, password: 'otra-clave-123' }, client)).rejects.toThrow(
      'Email o contraseña incorrectos',
    );
  });

  it('blocks suspended users even with the right password', async () => {
    const { userId } = await service.registerMerchant(merchantInput);
    repo.users.get(userId)!.status = 'SUSPENDED';
    await expect(
      service.login({ email: merchantInput.email, password: merchantInput.password }, client),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates the refresh token', async () => {
    await service.registerMerchant(merchantInput);
    const first = await service.login({ email: merchantInput.email, password: merchantInput.password }, client);
    const second = await service.refresh(first.refreshToken, client);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(repo.sessions.get(hashRefreshToken(first.refreshToken))!.revokedAt).not.toBeNull();
    expect(repo.activeSessions()).toHaveLength(1);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    await service.registerMerchant(merchantInput);
    const first = await service.login({ email: merchantInput.email, password: merchantInput.password }, client);
    const second = await service.refresh(first.refreshToken, client);

    await expect(service.refresh(first.refreshToken, client)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.activeSessions()).toHaveLength(0);
    await expect(service.refresh(second.refreshToken, client)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired refresh tokens', async () => {
    await service.registerMerchant(merchantInput);
    const issued = await service.login({ email: merchantInput.email, password: merchantInput.password }, client);
    now = new Date(now.getTime() + tokens.refreshTtlMs + 1);
    await expect(service.refresh(issued.refreshToken, client)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('stops refreshing once the user is suspended', async () => {
    const { userId } = await service.registerMerchant(merchantInput);
    const issued = await service.login({ email: merchantInput.email, password: merchantInput.password }, client);
    repo.users.get(userId)!.status = 'SUSPENDED';
    await expect(service.refresh(issued.refreshToken, client)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.activeSessions()).toHaveLength(0);
  });

  it('logout revokes every session of the device family', async () => {
    await service.registerMerchant(merchantInput);
    const issued = await service.login({ email: merchantInput.email, password: merchantInput.password }, client);
    await service.logout(issued.refreshToken);
    expect(repo.activeSessions()).toHaveLength(0);
  });

  it('never stores the raw refresh token', async () => {
    await service.registerMerchant(merchantInput);
    const issued = await service.login({ email: merchantInput.email, password: merchantInput.password }, client);
    expect(repo.sessions.has(issued.refreshToken)).toBe(false);
  });

  it('hashes passwords with a unique salt', async () => {
    expect(await hashPassword('misma-clave-123')).not.toBe(await hashPassword('misma-clave-123'));
  });
});
