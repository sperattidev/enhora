import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { REFRESH_COOKIE } from '../src/auth/auth.controller.js';
import { hashPassword } from '../src/auth/password.js';
import { loadEnv } from '../src/config/env.js';
import { users } from '../src/db/schema.js';

export const ORIGIN = 'https://app.enhora.test';
export const PASSWORD = 'clave-de-prueba-123';
export const FIRMAT = { lat: -33.4594, lng: -61.4832 };

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT';
  url: string;
  body?: unknown;
  token?: string;
  cookie?: string;
  origin?: string;
  ip?: string;
  headers?: Record<string, string>;
}

export interface TestContext {
  app: NestFastifyApplication;
  sql: postgres.Sql;
  db: ReturnType<typeof drizzle>;
  request: (opts: RequestOptions) => ReturnType<NestFastifyApplication['inject']>;
  login: (email: string) => Promise<{ token: string; cookie: string }>;
  createAdmin: (email: string) => Promise<void>;
  userId: (email: string) => Promise<string>;
  close: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-e2e',
    CORS_ORIGINS: ORIGIN,
  });
  const app = await createApp(env, { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);
  let ipCounter = 0;

  /** Every request comes from a different IP so the 5/min limit only applies where a test wants it. */
  const request = (opts: RequestOptions) =>
    app.inject({
      method: opts.method,
      url: opts.url,
      payload: opts.body as object | undefined,
      headers: {
        'x-forwarded-for': opts.ip ?? `10.${Math.floor(++ipCounter / 250) % 250}.${ipCounter % 250}.1`,
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.cookie ? { cookie: `${REFRESH_COOKIE}=${opts.cookie}` } : {}),
        ...(opts.origin ? { origin: opts.origin } : {}),
        ...opts.headers,
      },
    });

  return {
    app,
    sql,
    db,
    request,
    async login(email) {
      const res = await request({ method: 'POST', url: '/auth/login', body: { email, password: PASSWORD } });
      expect(res.statusCode).toBe(200);
      return { token: res.json<{ accessToken: string }>().accessToken, cookie: refreshCookie(res) };
    },
    async createAdmin(email) {
      await db.insert(users).values({ email, passwordHash: await hashPassword(PASSWORD), role: 'ADMIN' });
    },
    async userId(email) {
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      return user!.id;
    },
    async close() {
      await sql.end();
      await app.close();
    },
  };
}

export function refreshCookie(res: { cookies: { name: string; value: string }[] }): string {
  const cookie = res.cookies.find((c) => c.name === REFRESH_COOKIE);
  if (!cookie) throw new Error('refresh cookie missing');
  return cookie.value;
}

/** A valid CUIT built from a random 8-digit number so each run is unique. */
export function randomCuit(): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const base = `20${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
    const mod = 11 - (sum % 11);
    if (mod === 10) continue;
    return `${base}${mod === 11 ? 0 : mod}`;
  }
}

export function randomDni(): string {
  return String(30_000_000 + Math.floor(Math.random() * 9_999_999));
}

export function merchantRegistration(email: string) {
  return {
    email,
    password: PASSWORD,
    phone: '+5493465111111',
    citySlug: 'firmat',
    legalName: 'Comercio E2E SRL',
    displayName: 'Comercio E2E',
    cuit: randomCuit(),
    address: 'Belgrano 1200',
    location: FIRMAT,
  };
}
