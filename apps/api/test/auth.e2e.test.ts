import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { REFRESH_COOKIE } from '../src/auth/auth.controller.js';
import { hashPassword } from '../src/auth/password.js';
import { loadEnv } from '../src/config/env.js';
import { couriers, users } from '../src/db/schema.js';

const ORIGIN = 'https://app.enhora.test';
const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-e2e',
  CORS_ORIGINS: ORIGIN,
});

let app: NestFastifyApplication;
let sql: postgres.Sql;
let ipCounter = 0;
const run = randomUUID().slice(0, 8);

/** Every request comes from a different IP so the 5/min limit only applies where a test wants it. */
function request(opts: {
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  body?: unknown;
  token?: string;
  cookie?: string;
  origin?: string;
  ip?: string;
}) {
  return app.inject({
    method: opts.method,
    url: opts.url,
    payload: opts.body as object | undefined,
    headers: {
      'x-forwarded-for': opts.ip ?? `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`,
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.cookie ? { cookie: `${REFRESH_COOKIE}=${opts.cookie}` } : {}),
      ...(opts.origin ? { origin: opts.origin } : {}),
    },
  });
}

function refreshCookie(res: { cookies: { name: string; value: string }[] }): string {
  const cookie = res.cookies.find((c) => c.name === REFRESH_COOKIE);
  if (!cookie) throw new Error('refresh cookie missing');
  return cookie.value;
}

const password = 'clave-de-prueba-123';
const merchantEmail = `comercio-${run}@e2e.test`;
const courierEmail = `cadete-${run}@e2e.test`;
const adminEmail = `admin-${run}@e2e.test`;

/** Builds a valid CUIT from a random 8-digit DNI so each run is unique. */
function randomCuit(): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const base = `20${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
    const mod = 11 - (sum % 11);
    if (mod === 10) continue;
    return `${base}${mod === 11 ? 0 : mod}`;
  }
}

beforeAll(async () => {
  app = await createApp(env, { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  sql = postgres(env.DATABASE_URL, { max: 1 });
  await drizzle(sql)
    .insert(users)
    .values({ email: adminEmail, passwordHash: await hashPassword(password), role: 'ADMIN' });
});

afterAll(async () => {
  await sql?.end();
  await app?.close();
});

async function login(email: string) {
  const res = await request({ method: 'POST', url: '/auth/login', body: { email, password } });
  expect(res.statusCode).toBe(200);
  return { token: res.json<{ accessToken: string }>().accessToken, cookie: refreshCookie(res) };
}

describe('auth (e2e)', () => {
  it('registers a merchant and shows it as pending', async () => {
    const res = await request({
      method: 'POST',
      url: '/auth/register/merchant',
      body: {
        email: merchantEmail,
        password,
        phone: '+5493465111111',
        citySlug: 'firmat',
        legalName: 'Comercio E2E SRL',
        displayName: 'Comercio E2E',
        cuit: randomCuit(),
        address: 'Belgrano 1200',
        location: { lat: -33.4594, lng: -61.4832 },
      },
    });
    expect(res.statusCode).toBe(201);

    const { token } = await login(merchantEmail);
    const me = await request({ method: 'GET', url: '/auth/me', token });
    expect(me.json()).toMatchObject({ role: 'MERCHANT', merchant: { status: 'PENDING' }, courier: null });
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request({
      method: 'POST',
      url: '/auth/register/courier',
      body: {
        email: merchantEmail.toUpperCase(),
        password,
        phone: '+5493465222222',
        citySlug: 'firmat',
        fullName: 'Duplicado',
        dni: String(30_000_000 + Math.floor(Math.random() * 9_999_999)),
        vehicle: 'BICYCLE',
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects invalid input with field details', async () => {
    const res = await request({
      method: 'POST',
      url: '/auth/register/merchant',
      body: { email: 'no-email', password: 'corta' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ issues: { path: string }[] }>().issues.map((i) => i.path)).toContain('cuit');
  });

  it('lets an admin approve a courier', async () => {
    const reg = await request({
      method: 'POST',
      url: '/auth/register/courier',
      body: {
        email: courierEmail,
        password,
        phone: '+5493465333333',
        citySlug: 'firmat',
        fullName: 'Cadete E2E',
        dni: String(30_000_000 + Math.floor(Math.random() * 9_999_999)),
        vehicle: 'MOTORCYCLE',
      },
    });
    expect(reg.statusCode).toBe(201);
    const { userId } = reg.json<{ userId: string }>();
    const [courier] = await drizzle(sql).select({ id: couriers.id }).from(couriers).where(eq(couriers.userId, userId));

    const courierSession = await login(courierEmail);
    const forbidden = await request({ method: 'GET', url: '/admin/couriers', token: courierSession.token });
    expect(forbidden.statusCode).toBe(403);

    const admin = await login(adminEmail);
    const pending = await request({ method: 'GET', url: '/admin/couriers?kycStatus=PENDING', token: admin.token });
    expect(pending.json<{ id: string }[]>().map((c) => c.id)).toContain(courier!.id);

    const approve = await request({
      method: 'PATCH',
      url: `/admin/couriers/${courier!.id}/kyc`,
      token: admin.token,
      body: { kycStatus: 'APPROVED' },
    });
    expect(approve.statusCode).toBe(204);

    const me = await request({ method: 'GET', url: '/auth/me', token: courierSession.token });
    expect(me.json()).toMatchObject({ courier: { kycStatus: 'APPROVED' } });
  });

  it('requires a token on protected routes', async () => {
    expect((await request({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401);
    expect((await request({ method: 'GET', url: '/auth/me', token: 'basura' })).statusCode).toBe(401);
  });

  it('sets a hardened refresh cookie', async () => {
    const res = await request({ method: 'POST', url: '/auth/login', body: { email: merchantEmail, password } });
    const cookie = res.cookies.find((c) => c.name === REFRESH_COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/auth' });
    expect(res.json()).not.toHaveProperty('refreshToken');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const first = await login(merchantEmail);
    const rotated = await request({ method: 'POST', url: '/auth/refresh', cookie: first.cookie, origin: ORIGIN });
    expect(rotated.statusCode).toBe(200);
    const second = refreshCookie(rotated);

    const reused = await request({ method: 'POST', url: '/auth/refresh', cookie: first.cookie, origin: ORIGIN });
    expect(reused.statusCode).toBe(401);
    const afterReuse = await request({ method: 'POST', url: '/auth/refresh', cookie: second, origin: ORIGIN });
    expect(afterReuse.statusCode).toBe(401);
  });

  it('rejects refresh from an untrusted origin', async () => {
    const { cookie } = await login(merchantEmail);
    const res = await request({ method: 'POST', url: '/auth/refresh', cookie, origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
  });

  it('logs out', async () => {
    const { cookie } = await login(merchantEmail);
    const out = await request({ method: 'POST', url: '/auth/logout', cookie, origin: ORIGIN });
    expect(out.statusCode).toBe(204);
    const res = await request({ method: 'POST', url: '/auth/refresh', cookie, origin: ORIGIN });
    expect(res.statusCode).toBe(401);
  });

  it('suspending a user kills their sessions', async () => {
    const victim = await login(merchantEmail);
    const admin = await login(adminEmail);
    const [user] = await drizzle(sql).select({ id: users.id }).from(users).where(eq(users.email, merchantEmail));

    const suspend = await request({
      method: 'PATCH',
      url: `/admin/users/${user!.id}/status`,
      token: admin.token,
      body: { status: 'SUSPENDED' },
    });
    expect(suspend.statusCode).toBe(204);
    const refresh = await request({ method: 'POST', url: '/auth/refresh', cookie: victim.cookie, origin: ORIGIN });
    expect(refresh.statusCode).toBe(401);
    const relogin = await request({ method: 'POST', url: '/auth/login', body: { email: merchantEmail, password } });
    expect(relogin.statusCode).toBe(401);
  });

  it('rate-limits login attempts per IP', async () => {
    const ip = '203.0.113.7';
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request({
        method: 'POST',
        url: '/auth/login',
        body: { email: 'nadie@e2e.test', password: 'x' },
        ip,
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});
