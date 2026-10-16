import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REFRESH_COOKIE } from '../src/auth/auth.controller.js';
import { couriers, users } from '../src/db/schema.js';
import { createTestContext, ORIGIN, PASSWORD, randomCuit, refreshCookie, type TestContext } from './helpers.js';

let ctx: TestContext;
let sql: postgres.Sql;
const run = randomUUID().slice(0, 8);
const password = PASSWORD;
const merchantEmail = `comercio-${run}@e2e.test`;
const courierEmail = `cadete-${run}@e2e.test`;
const adminEmail = `admin-${run}@e2e.test`;

const request: TestContext['request'] = (opts) => ctx.request(opts);
const login: TestContext['login'] = (email) => ctx.login(email);

beforeAll(async () => {
  ctx = await createTestContext();
  sql = ctx.sql;
  await ctx.createAdmin(adminEmail);
});

afterAll(async () => {
  await ctx?.close();
});

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
    expect(me.json()).toMatchObject({
      role: 'MERCHANT',
      merchant: { status: 'PENDING', address: 'Belgrano 1200' },
      courier: null,
    });
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
