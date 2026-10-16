import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { merchants, merchantMembers } from '../src/db/schema.js';
import {
  createTestContext,
  FIRMAT,
  merchantRegistration,
  resetFirmatZones,
  square,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
const run = randomUUID().slice(0, 8);
const adminEmail = `admin-jobs-${run}@e2e.test`;
const activeEmail = `activo-${run}@e2e.test`;
const pendingEmail = `pendiente-${run}@e2e.test`;
const otherEmail = `otro-${run}@e2e.test`;
let admin: string;
let active: string;
let pending: string;
let other: string;

// Firmat centre: 0.01° box. Outskirts: a ring-shaped area is overkill here, so a separate box to the east.
const CENTRO = square(FIRMAT, 0.01);
const ESTE_CENTER = { lat: FIRMAT.lat, lng: FIRMAT.lng + 0.03 };
const ESTE = square(ESTE_CENTER, 0.01);
const FAR_AWAY = { lat: -34.6, lng: -58.38 };

const pickup = { kind: 'PICKUP', address: 'Belgrano 1200', location: FIRMAT };
const dropoffCentro = { kind: 'DROPOFF', address: 'San Martín 850', location: FIRMAT, cashToCollect: 1_250_000 };
const dropoffEste = { kind: 'DROPOFF', address: 'Ruta 33 km 2', location: ESTE_CENTER };

async function registerAndApprove(email: string, approve: boolean): Promise<string> {
  const res = await ctx.request({ method: 'POST', url: '/auth/register/merchant', body: merchantRegistration(email) });
  expect(res.statusCode).toBe(201);
  if (approve) {
    const userId = res.json<{ userId: string }>().userId;
    const [m] = await ctx.db
      .select({ id: merchantMembers.merchantId })
      .from(merchantMembers)
      .where(eq(merchantMembers.userId, userId));
    const ok = await ctx.request({
      method: 'PATCH',
      url: `/admin/merchants/${m!.id}/status`,
      token: admin,
      body: { status: 'ACTIVE' },
    });
    expect(ok.statusCode).toBe(204);
  }
  return (await ctx.login(email)).token;
}

beforeAll(async () => {
  ctx = await createTestContext();
  await ctx.createAdmin(adminEmail);
  admin = (await ctx.login(adminEmail)).token;

  // The zones e2e may already have run against this database; start from a clean Firmat map.
  await resetFirmatZones(ctx);
  for (const [name, feeCents, area] of [
    ['Centro', 250_000, CENTRO],
    ['Este', 400_000, ESTE],
  ] as const) {
    const res = await ctx.request({
      method: 'POST',
      url: '/admin/zones',
      token: admin,
      body: { citySlug: 'firmat', name: `${name} ${run}`, feeCents, area },
    });
    expect(res.statusCode).toBe(201);
  }

  active = await registerAndApprove(activeEmail, true);
  pending = await registerAndApprove(pendingEmail, false);
  other = await registerAndApprove(otherEmail, true);
});

afterAll(async () => {
  await ctx?.close();
});

describe('zones (e2e)', () => {
  it('rejects an overlapping zone', async () => {
    const res = await ctx.request({
      method: 'POST',
      url: '/admin/zones',
      token: admin,
      body: { citySlug: 'firmat', name: 'Pisa al centro', feeCents: 100_000, area: square(FIRMAT, 0.005) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects a self-intersecting polygon', async () => {
    const { lat, lng } = { lat: FIRMAT.lat + 0.2, lng: FIRMAT.lng + 0.2 };
    const bowtie = {
      type: 'Polygon',
      coordinates: [
        [
          [lng, lat],
          [lng + 0.01, lat + 0.01],
          [lng + 0.01, lat],
          [lng, lat + 0.01],
          [lng, lat],
        ],
      ],
    };
    const res = await ctx.request({
      method: 'POST',
      url: '/admin/zones',
      token: admin,
      body: { citySlug: 'firmat', name: 'Moño', feeCents: 100_000, area: bowtie },
    });
    expect(res.statusCode).toBe(422);
  });

  it('only admins manage zones and pricing', async () => {
    const res = await ctx.request({ method: 'GET', url: '/admin/cities/firmat/pricing', token: active });
    expect(res.statusCode).toBe(403);
  });

  it('lets the admin read and change pricing', async () => {
    const res = await ctx.request({ method: 'GET', url: '/admin/cities/firmat/pricing', token: admin });
    expect(res.statusCode).toBe(200);
    const put = await ctx.request({
      method: 'PUT',
      url: '/admin/cities/firmat/pricing',
      token: admin,
      body: {
        ...res.json<Record<string, number>>(),
        extraStopFeeCents: 150_000,
        errandFeeCents: 200_000,
        roundToCents: 5_000,
      },
    });
    expect(put.statusCode).toBe(204);
  });
});

describe('jobs (e2e)', () => {
  let jobId: string;
  let trackingToken: string;

  it('quotes by the most expensive zone', async () => {
    const res = await ctx.request({
      method: 'POST',
      url: '/jobs/quote',
      token: active,
      body: { stops: [pickup, dropoffCentro, dropoffEste] },
    });
    expect(res.statusCode).toBe(200);
    // Base: Este (4000) + one extra stop (1500) = 5500.
    expect(res.json()).toMatchObject({ base: 400_000, extraStops: 150_000, total: 550_000 });
  });

  it('reports which stops are out of coverage', async () => {
    const res = await ctx.request({
      method: 'POST',
      url: '/jobs/quote',
      token: active,
      body: { stops: [pickup, { ...dropoffCentro, location: FAR_AWAY }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ stopIndexes: [1] });
  });

  it('does not let a pending merchant create jobs', async () => {
    const res = await ctx.request({
      method: 'POST',
      url: '/jobs',
      token: pending,
      body: { stops: [pickup, dropoffCentro] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates a job searching for a courier, with server-side price and delivery codes', async () => {
    const res = await ctx.request({
      method: 'POST',
      url: '/jobs',
      token: active,
      body: { stops: [pickup, dropoffCentro], priceCents: 1 },
      headers: { 'idempotency-key': `job-${run}` },
    });
    expect(res.statusCode).toBe(201);
    const job = res.json<{
      id: string;
      status: string;
      priceCents: number;
      trackingToken: string;
      stops: { kind: string; deliveryCode: string | null; location: { lat: number; lng: number } }[];
      events: { toStatus: string }[];
    }>();
    expect(job).toMatchObject({ status: 'SEARCHING', priceCents: 250_000 });
    expect(job.stops[0]!.deliveryCode).toBeNull();
    expect(job.stops[1]!.deliveryCode).toMatch(/^\d{4}$/);
    expect(job.stops[1]!.location.lat).toBeCloseTo(FIRMAT.lat, 6);
    expect(job.events.map((e) => e.toStatus)).toEqual(['SEARCHING']);
    jobId = job.id;
    trackingToken = job.trackingToken;
  });

  it('returns the same job when the idempotency key repeats', async () => {
    const res = await ctx.request({
      method: 'POST',
      url: '/jobs',
      token: active,
      body: { stops: [pickup, dropoffCentro] },
      headers: { 'idempotency-key': `job-${run}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(jobId);
  });

  it('creates scheduled jobs as SCHEDULED', async () => {
    const res = await ctx.request({
      method: 'POST',
      url: '/jobs',
      token: active,
      body: { stops: [pickup, dropoffCentro], scheduledFor: new Date(Date.now() + 3_600_000).toISOString() },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'SCHEDULED' });
  });

  it('lists only the merchant’s own jobs, newest first', async () => {
    const mine = await ctx.request({ method: 'GET', url: '/jobs?limit=10', token: active });
    const items = mine.json<{ items: { id: string; destination: string }[] }>().items;
    expect(items.map((i) => i.id)).toContain(jobId);
    expect(items.find((i) => i.id === jobId)!.destination).toBe('San Martín 850');

    const theirs = await ctx.request({ method: 'GET', url: '/jobs', token: other });
    expect(theirs.json<{ items: unknown[] }>().items).toHaveLength(0);
  });

  it('hides other merchants’ jobs behind a 404', async () => {
    const res = await ctx.request({ method: 'GET', url: `/jobs/${jobId}`, token: other });
    expect(res.statusCode).toBe(404);
    const cancel = await ctx.request({
      method: 'POST',
      url: `/jobs/${jobId}/cancel`,
      token: other,
      body: { reason: 'no es mío' },
    });
    expect(cancel.statusCode).toBe(404);
  });

  it('keeps couriers and admins out of merchant endpoints', async () => {
    const res = await ctx.request({ method: 'GET', url: '/jobs', token: admin });
    expect(res.statusCode).toBe(403);
  });

  it('shows public tracking without private data', async () => {
    const res = await ctx.request({ method: 'GET', url: `/t/${trackingToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = JSON.stringify(res.json());
    expect(res.json()).toMatchObject({ status: 'SEARCHING', merchantName: 'Comercio E2E', courierName: null });
    expect(body).not.toContain('San Martín');
    expect(body).not.toContain('deliveryCode');
    expect(body).not.toContain('1250000');
  });

  it('returns 404 for unknown tracking tokens', async () => {
    expect((await ctx.request({ method: 'GET', url: `/t/${'x'.repeat(32)}` })).statusCode).toBe(404);
    expect((await ctx.request({ method: 'GET', url: '/t/corto' })).statusCode).toBe(404);
  });

  it('cancels with a reason and records it in the audit trail', async () => {
    const res = await ctx.request({
      method: 'POST',
      url: `/jobs/${jobId}/cancel`,
      token: active,
      body: { reason: 'El cliente se arrepintió' },
    });
    expect(res.statusCode).toBe(200);
    const job = res.json<{
      status: string;
      cancelReason: string;
      events: { fromStatus: string; toStatus: string }[];
    }>();
    expect(job).toMatchObject({ status: 'CANCELLED', cancelReason: 'El cliente se arrepintió' });
    expect(job.events.at(-1)).toMatchObject({ fromStatus: 'SEARCHING', toStatus: 'CANCELLED' });
  });

  it('refuses to cancel twice or relaunch a cancelled job', async () => {
    const again = await ctx.request({
      method: 'POST',
      url: `/jobs/${jobId}/cancel`,
      token: active,
      body: { reason: 'otra vez' },
    });
    expect(again.statusCode).toBe(409);
    const relaunch = await ctx.request({ method: 'POST', url: `/jobs/${jobId}/relaunch`, token: active });
    expect(relaunch.statusCode).toBe(409);
  });

  it('keeps tracking working right after cancellation', async () => {
    const res = await ctx.request({ method: 'GET', url: `/t/${trackingToken}` });
    expect(res.json()).toMatchObject({ status: 'CANCELLED' });
  });

  it('stops quoting once a zone is disabled', async () => {
    const zones = await ctx.request({ method: 'GET', url: '/admin/cities/firmat/zones', token: admin });
    const este = zones.json<{ id: string; name: string }[]>().find((z) => z.name === `Este ${run}`)!;
    const off = await ctx.request({
      method: 'PATCH',
      url: `/admin/zones/${este.id}`,
      token: admin,
      body: { active: false },
    });
    expect(off.statusCode).toBe(204);
    const res = await ctx.request({
      method: 'POST',
      url: '/jobs/quote',
      token: active,
      body: { stops: [pickup, dropoffEste] },
    });
    expect(res.statusCode).toBe(422);
  });

  it('suspended merchants cannot create jobs', async () => {
    const userId = await ctx.userId(otherEmail);
    const [m] = await ctx.db
      .select({ id: merchants.id })
      .from(merchantMembers)
      .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
      .where(eq(merchantMembers.userId, userId));
    await ctx.request({
      method: 'PATCH',
      url: `/admin/merchants/${m!.id}/status`,
      token: admin,
      body: { status: 'SUSPENDED' },
    });
    const res = await ctx.request({
      method: 'POST',
      url: '/jobs',
      token: other,
      body: { stops: [pickup, dropoffCentro] },
    });
    expect(res.statusCode).toBe(403);
  });
});
