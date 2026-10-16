import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { couriers, merchantMembers } from '../src/db/schema.js';
import {
  courierRegistration,
  createTestContext,
  FIRMAT,
  merchantRegistration,
  resetFirmatZones,
  square,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
const run = randomUUID().slice(0, 8);
const adminEmail = `admin-panel-${run}@e2e.test`;
let admin: string;
let merchant: string;
let merchantId: string;
let courierId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  await ctx.createAdmin(adminEmail);
  admin = (await ctx.login(adminEmail)).token;

  const merchantEmail = `comercio-panel-${run}@e2e.test`;
  const reg = await ctx.request({
    method: 'POST',
    url: '/auth/register/merchant',
    body: merchantRegistration(merchantEmail),
  });
  const [m] = await ctx.db
    .select({ id: merchantMembers.merchantId })
    .from(merchantMembers)
    .where(eq(merchantMembers.userId, reg.json<{ userId: string }>().userId));
  merchantId = m!.id;
  merchant = (await ctx.login(merchantEmail)).token;

  const courier = await ctx.request({
    method: 'POST',
    url: '/auth/register/courier',
    body: courierRegistration(`cadete-panel-${run}@e2e.test`, 'Cadete Panel'),
  });
  const [c] = await ctx.db
    .select({ id: couriers.id })
    .from(couriers)
    .where(eq(couriers.userId, courier.json<{ userId: string }>().userId));
  courierId = c!.id;
});

afterAll(async () => {
  await ctx?.close();
});

describe('admin panel (e2e)', () => {
  it('is only for admins', async () => {
    for (const url of ['/admin/overview', '/admin/jobs', '/admin/audit']) {
      expect((await ctx.request({ method: 'GET', url, token: merchant })).statusCode).toBe(403);
      expect((await ctx.request({ method: 'GET', url })).statusCode).toBe(401);
    }
  });

  it('counts pending approvals', async () => {
    const res = await ctx.request({ method: 'GET', url: '/admin/overview', token: admin });
    expect(res.statusCode).toBe(200);
    const overview = res.json<Record<string, number>>();
    expect(overview.pendingCouriers).toBeGreaterThanOrEqual(1);
    expect(overview.pendingMerchants).toBeGreaterThanOrEqual(1);
    expect(Object.values(overview).every((v) => typeof v === 'number')).toBe(true);
  });

  it('records who approved what', async () => {
    await ctx.request({
      method: 'PATCH',
      url: `/admin/couriers/${courierId}/kyc`,
      token: admin,
      body: { kycStatus: 'APPROVED' },
    });
    await ctx.request({
      method: 'PATCH',
      url: `/admin/merchants/${merchantId}/status`,
      token: admin,
      body: { status: 'ACTIVE' },
    });
    const res = await ctx.request({ method: 'GET', url: '/admin/audit?limit=10', token: admin });
    const entries = res.json<{ action: string; targetId: string; adminEmail: string; details: unknown }[]>();
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'courier.kyc',
          targetId: courierId,
          adminEmail,
          details: { kycStatus: 'APPROVED' },
        }),
        expect.objectContaining({ action: 'merchant.status', targetId: merchantId, adminEmail }),
      ]),
    );
  });

  it('does not audit a change that did not happen', async () => {
    const missing = randomUUID();
    const res = await ctx.request({
      method: 'PATCH',
      url: `/admin/couriers/${missing}/kyc`,
      token: admin,
      body: { kycStatus: 'APPROVED' },
    });
    expect(res.statusCode).toBe(404);
    const log = await ctx.request({ method: 'GET', url: '/admin/audit?limit=20', token: admin });
    expect(log.json<{ targetId: string }[]>().some((e) => e.targetId === missing)).toBe(false);
  });

  it('lists active jobs across merchants and audits zone changes', async () => {
    await resetFirmatZones(ctx);
    const zone = await ctx.request({
      method: 'POST',
      url: '/admin/zones',
      token: admin,
      body: { citySlug: 'firmat', name: `Panel ${run}`, feeCents: 300_000, area: square(FIRMAT, 0.05) },
    });
    expect(zone.statusCode).toBe(201);
    const zoneId = zone.json<{ id: string }>().id;

    const job = await ctx.request({
      method: 'POST',
      url: '/jobs',
      token: merchant,
      body: {
        stops: [
          { kind: 'PICKUP', address: 'Belgrano 1200', location: FIRMAT },
          { kind: 'DROPOFF', address: 'Mitre 640', location: FIRMAT },
        ],
      },
    });
    expect(job.statusCode).toBe(201);
    const jobId = job.json<{ id: string }>().id;

    const list = await ctx.request({ method: 'GET', url: '/admin/jobs?scope=active', token: admin });
    const mine = list.json<{ id: string; merchantName: string; destination: string }[]>().find((j) => j.id === jobId);
    expect(mine).toMatchObject({ merchantName: 'Comercio E2E', destination: 'Mitre 640' });

    const log = await ctx.request({ method: 'GET', url: '/admin/audit?limit=20', token: admin });
    expect(log.json<{ action: string; targetId: string }[]>()).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'zone.create', targetId: zoneId })]),
    );
    await ctx.request({
      method: 'POST',
      url: `/jobs/${jobId}/cancel`,
      token: merchant,
      body: { reason: 'fin de prueba' },
    });
  });
});
