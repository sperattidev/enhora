import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import { TokenService } from './tokens.js';

const env = loadEnv({ DATABASE_URL: 'postgres://localhost/test', JWT_ACCESS_SECRET: 'a'.repeat(32) });
const tokens = new TokenService(env);

describe('TokenService', () => {
  it('round-trips the claims', async () => {
    const token = await tokens.signAccess({ userId: 'u1', role: 'COURIER' });
    expect(await tokens.verifyAccess(token)).toEqual({ userId: 'u1', role: 'COURIER' });
  });

  it('rejects tokens signed with another secret', async () => {
    const other = new TokenService({ ...env, JWT_ACCESS_SECRET: 'b'.repeat(32) });
    expect(await tokens.verifyAccess(await other.signAccess({ userId: 'u1', role: 'ADMIN' }))).toBeNull();
  });

  it('rejects tampered tokens', async () => {
    const token = await tokens.signAccess({ userId: 'u1', role: 'COURIER' });
    const [h, p, s] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), role: 'ADMIN' }),
    );
    expect(await tokens.verifyAccess(`${h}.${forged.toString('base64url')}.${s}`)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    const expired = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuer('enhora')
      .setAudience('enhora-api')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    expect(await tokens.verifyAccess(expired)).toBeNull();
  });

  it('rejects unknown roles', async () => {
    const key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    const token = await new SignJWT({ role: 'ROOT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuer('enhora')
      .setAudience('enhora-api')
      .setExpirationTime('5m')
      .sign(key);
    expect(await tokens.verifyAccess(token)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await tokens.verifyAccess('no.es.jwt')).toBeNull();
  });
});
