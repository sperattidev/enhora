import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { couriers, jobs, merchantMembers, offers } from '../src/db/schema.js';
import { DispatchService } from '../src/dispatch/dispatch.service.js';
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
let dispatch: DispatchService;
const run = randomUUID().slice(0, 8);
let admin: string;
let merchant: string;
const courier = { near: '', far: '', pending: '' };
const courierIds = { near: '', far: '' };

const NEAR = FIRMAT;
const FAR = { lat: FIRMAT.lat, lng: FIRMAT.lng + 0.02 }; // ~1.9 km east
const CASH = 1_250_000;

interface OfferView {
  id: string;
  jobId: string;
  earningsCents: number;
  stops: { kind: string; cashToCollectCents: number | null }[];
}
interface CourierJob {
  id: string;
  status: string;
  stops: Record<string, unknown>[];
}

async function registerCourier(name: keyof typeof courier, approve: boolean, at?: { lat: number; lng: number }) {
  const email = `cadete-${name}-${run}@e2e.test`;
  const res = await ctx.request({
    method: 'POST',
    url: '/auth/register/courier',
    body: courierRegistration(email, `Cadete ${name} Prueba`),
  });
  expect(res.statusCode).toBe(201);
  const userId = res.json<{ userId: string }>().userId;
  const [row] = await ctx.db.select({ id: couriers.id }).from(couriers).where(eq(couriers.userId, userId));
  if (approve) {
    const ok = await ctx.request({
      method: 'PATCH',
      url: `/admin/couriers/${row!.id}/kyc`,
      token: admin,
      body: { kycStatus: 'APPROVED' },
    });
    expect(ok.statusCode).toBe(204);
  }
  const token = (await ctx.login(email)).token;
  if (at) {
    expect(
      (await ctx.request({ method: 'PUT', url: '/courier/availability', token, body: { online: true } })).statusCode,
    ).toBe(200);
    expect((await ctx.request({ method: 'PUT', url: '/courier/location', token, body: at })).statusCode).toBe(204);
  }
  return { token, id: row!.id };
}

async function createJob(): Promise<string> {
  const res = await ctx.request({
    method: 'POST',
    url: '/jobs',
    token: merchant,
    body: {
      stops: [
        { kind: 'PICKUP', address: 'Belgrano 1200', location: FIRMAT },
        { kind: 'DROPOFF', address: 'San Martín 850', location: FIRMAT, cashToCollect: CASH },
      ],
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
}

const offerFor = async (token: string) =>
  (await ctx.request({ method: 'GET', url: '/courier/offer', token })).json<OfferView | null>();

async function jobStatus(jobId: string): Promise<string> {
  const [row] = await ctx.db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId));
  return row!.status;
}

function advance(token: string, jobId: string, position: number, body: Record<string, unknown>) {
  return ctx.request({ method: 'POST', url: `/courier/jobs/${jobId}/stops/${position}/advance`, token, body });
}

async function deliveryCode(jobId: string): Promise<string> {
  const res = await ctx.request({ method: 'GET', url: `/jobs/${jobId}`, token: merchant });
  return res.json<{ stops: { deliveryCode: string | null }[] }>().stops[1]!.deliveryCode!;
}

/** Accept the offer the given courier currently holds for `jobId`. */
async function accept(token: string, jobId: string) {
  const offer = await offerFor(token);
  expect(offer?.jobId).toBe(jobId);
  const res = await ctx.request({ method: 'POST', url: `/courier/offers/${offer!.id}/accept`, token });
  expect(res.statusCode).toBe(200);
  return res.json<CourierJob>();
}

beforeAll(async () => {
  ctx = await createTestContext();
  dispatch = ctx.app.get(DispatchService);
  const adminEmail = `admin-dispatch-${run}@e2e.test`;
  await ctx.createAdmin(adminEmail);
  admin = (await ctx.login(adminEmail)).token;

  await resetFirmatZones(ctx);
  const zone = await ctx.request({
    method: 'POST',
    url: '/admin/zones',
    token: admin,
    body: { citySlug: 'firmat', name: `Firmat ${run}`, feeCents: 300_000, area: square(FIRMAT, 0.05) },
  });
  expect(zone.statusCode).toBe(201);

  const merchantEmail = `comercio-dispatch-${run}@e2e.test`;
  const reg = await ctx.request({
    method: 'POST',
    url: '/auth/register/merchant',
    body: merchantRegistration(merchantEmail),
  });
  const [m] = await ctx.db
    .select({ id: merchantMembers.merchantId })
    .from(merchantMembers)
    .where(eq(merchantMembers.userId, reg.json<{ userId: string }>().userId));
  await ctx.request({
    method: 'PATCH',
    url: `/admin/merchants/${m!.id}/status`,
    token: admin,
    body: { status: 'ACTIVE' },
  });
  merchant = (await ctx.login(merchantEmail)).token;

  const near = await registerCourier('near', true, NEAR);
  const far = await registerCourier('far', true, FAR);
  const pending = await registerCourier('pending', false);
  courier.near = near.token;
  courier.far = far.token;
  courier.pending = pending.token;
  courierIds.near = near.id;
  courierIds.far = far.id;
});

afterAll(async () => {
  await ctx?.close();
});

describe('dispatch (e2e)', () => {
  it('does not let an unapproved courier go online', async () => {
    const res = await ctx.request({
      method: 'PUT',
      url: '/courier/availability',
      token: courier.pending,
      body: { online: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('keeps merchants out of courier endpoints', async () => {
    expect((await ctx.request({ method: 'GET', url: '/courier/offer', token: merchant })).statusCode).toBe(403);
  });

  it('offers sequentially, closest first, and expires when nobody is left', async () => {
    const jobId = await createJob();

    await dispatch.tick();
    const first = await offerFor(courier.near);
    expect(first).toMatchObject({ jobId, earningsCents: 300_000 });
    expect(first!.stops[1]).toMatchObject({ kind: 'DROPOFF', cashToCollectCents: CASH });
    expect(JSON.stringify(first)).not.toContain('contactPhone');
    expect(await offerFor(courier.far)).toBeNull();

    // A second tick must not stack another offer while one is live.
    await dispatch.tick();
    expect(await offerFor(courier.far)).toBeNull();

    expect(
      (await ctx.request({ method: 'POST', url: `/courier/offers/${first!.id}/reject`, token: courier.near }))
        .statusCode,
    ).toBe(204);
    await dispatch.tick();
    const second = await offerFor(courier.far);
    expect(second?.jobId).toBe(jobId);

    // The far courier lets it time out; with everyone tried, the job keeps waiting...
    await ctx.db
      .update(offers)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(offers.id, second!.id));
    const t1 = await dispatch.tick();
    expect(t1.expiredOffers).toBeGreaterThanOrEqual(1);
    expect(await jobStatus(jobId)).toBe('SEARCHING');

    // ...until the search times out.
    await ctx.db
      .update(jobs)
      .set({ searchingSince: new Date(Date.now() - dispatch.policy.searchTimeoutMs - 1000) })
      .where(eq(jobs.id, jobId));
    await dispatch.tick();
    expect(await jobStatus(jobId)).toBe('EXPIRED');

    // Relaunching starts a fresh search, so the near courier is offered again.
    expect((await ctx.request({ method: 'POST', url: `/jobs/${jobId}/relaunch`, token: merchant })).statusCode).toBe(
      200,
    );
    await dispatch.tick();
    expect((await offerFor(courier.near))?.jobId).toBe(jobId);
    await ctx.request({
      method: 'POST',
      url: `/jobs/${jobId}/cancel`,
      token: merchant,
      body: { reason: 'fin de prueba' },
    });
    expect(await offerFor(courier.near)).toBeNull();
    const withdrawn = await ctx.db.select({ status: offers.status }).from(offers).where(eq(offers.jobId, jobId));
    expect(withdrawn.map((o) => o.status)).toContain('WITHDRAWN');
  });

  it('runs a delivery end to end with the recipient code and cash', async () => {
    const jobId = await createJob();
    await dispatch.tick();
    const assigned = await accept(courier.near, jobId);
    expect(assigned.status).toBe('ASSIGNED');
    expect(JSON.stringify(assigned)).not.toContain('deliveryCode');

    const [trackingRow] = await ctx.db.select({ token: jobs.trackingToken }).from(jobs).where(eq(jobs.id, jobId));
    const tracking = trackingRow!.token;
    const track = await ctx.request({ method: 'GET', url: `/t/${tracking}` });
    expect(track.json()).toMatchObject({ status: 'ASSIGNED', courierName: 'Cadete' });

    expect((await advance(courier.near, jobId, 1, { to: 'EN_ROUTE' })).statusCode).toBe(409);
    expect((await advance(courier.far, jobId, 0, { to: 'EN_ROUTE' })).statusCode).toBe(404);

    for (const to of ['EN_ROUTE', 'ARRIVED', 'DONE']) {
      expect((await advance(courier.near, jobId, 0, { to })).statusCode).toBe(200);
    }
    expect(await jobStatus(jobId)).toBe('IN_PROGRESS');

    await advance(courier.near, jobId, 1, { to: 'EN_ROUTE' });
    await advance(courier.near, jobId, 1, { to: 'ARRIVED' });
    expect((await advance(courier.near, jobId, 1, { to: 'DONE' })).statusCode).toBe(409);
    const code = await deliveryCode(jobId);
    const wrong = code === '0000' ? '1111' : '0000';
    expect((await advance(courier.near, jobId, 1, { to: 'DONE', deliveryCode: wrong })).statusCode).toBe(409);

    const [before] = await ctx.db
      .select({ cash: couriers.cashInHandCents })
      .from(couriers)
      .where(eq(couriers.id, courierIds.near));
    const done = await advance(courier.near, jobId, 1, { to: 'DONE', deliveryCode: code });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'COMPLETED' });

    const [after] = await ctx.db
      .select({ cash: couriers.cashInHandCents })
      .from(couriers)
      .where(eq(couriers.id, courierIds.near));
    expect(after!.cash - before!.cash).toBe(CASH);

    const detail = await ctx.request({ method: 'GET', url: `/jobs/${jobId}`, token: merchant });
    const events = detail.json<{ events: { toStatus: string; stopPosition: number | null }[] }>().events;
    expect(events.map((e) => e.toStatus)).toEqual(
      expect.arrayContaining(['SEARCHING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED']),
    );
    expect((await ctx.request({ method: 'GET', url: `/t/${tracking}` })).json()).toMatchObject({ status: 'COMPLETED' });
    expect((await ctx.request({ method: 'GET', url: '/courier/jobs', token: courier.near })).json()).toEqual([]);
  });

  it('locks a stop after too many wrong codes', async () => {
    const jobId = await createJob();
    await dispatch.tick();
    await accept(courier.near, jobId);
    for (const to of ['EN_ROUTE', 'ARRIVED', 'DONE']) await advance(courier.near, jobId, 0, { to });
    await advance(courier.near, jobId, 1, { to: 'EN_ROUTE' });
    await advance(courier.near, jobId, 1, { to: 'ARRIVED' });

    const code = await deliveryCode(jobId);
    const wrong = code === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) await advance(courier.near, jobId, 1, { to: 'DONE', deliveryCode: wrong });
    const res = await advance(courier.near, jobId, 1, { to: 'DONE', deliveryCode: code });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ message: string }>().message).toContain('Demasiados intentos');

    await advance(courier.near, jobId, 1, { to: 'FAILED', failureReason: 'OTHER', note: 'código bloqueado' });
    expect(await jobStatus(jobId)).toBe('COMPLETED');
  });

  it('re-offers a released job to someone else', async () => {
    const jobId = await createJob();
    await dispatch.tick();
    await accept(courier.near, jobId);
    expect(
      (await ctx.request({ method: 'POST', url: `/courier/jobs/${jobId}/release`, token: courier.near })).statusCode,
    ).toBe(204);
    expect(await jobStatus(jobId)).toBe('SEARCHING');

    await dispatch.tick();
    expect(await offerFor(courier.near)).toBeNull();
    await accept(courier.far, jobId);

    // The merchant can still cancel before pickup; the job leaves the courier's list.
    await ctx.request({
      method: 'POST',
      url: `/jobs/${jobId}/cancel`,
      token: merchant,
      body: { reason: 'cambio de planes' },
    });
    expect((await ctx.request({ method: 'GET', url: '/courier/jobs', token: courier.far })).json()).toEqual([]);
  });

  it('gives back the pending offer when the courier goes offline', async () => {
    const jobId = await createJob();
    await dispatch.tick();
    expect((await offerFor(courier.near))?.jobId).toBe(jobId);
    await ctx.request({ method: 'PUT', url: '/courier/availability', token: courier.near, body: { online: false } });
    expect(await offerFor(courier.near)).toBeNull();

    await dispatch.tick();
    expect((await offerFor(courier.far))?.jobId).toBe(jobId);
    await ctx.request({
      method: 'POST',
      url: `/jobs/${jobId}/cancel`,
      token: merchant,
      body: { reason: 'fin de prueba' },
    });
    await ctx.request({ method: 'PUT', url: '/courier/availability', token: courier.near, body: { online: true } });
  });

  it('ignores couriers whose location is stale', async () => {
    await ctx.db
      .update(couriers)
      .set({ lastSeenAt: new Date(Date.now() - dispatch.policy.staleAfterMs - 1000) })
      .where(eq(couriers.id, courierIds.far));
    await ctx.request({ method: 'PUT', url: '/courier/location', token: courier.near, body: NEAR });
    await ctx.request({ method: 'PUT', url: '/courier/availability', token: courier.near, body: { online: false } });

    const jobId = await createJob();
    await dispatch.tick();
    expect(await offerFor(courier.far)).toBeNull();
    expect(await jobStatus(jobId)).toBe('SEARCHING');
    await ctx.request({
      method: 'POST',
      url: `/jobs/${jobId}/cancel`,
      token: merchant,
      body: { reason: 'fin de prueba' },
    });
  });

  it('starts searching for scheduled jobs shortly before their time', async () => {
    const res = await ctx.request({
      method: 'POST',
      url: '/jobs',
      token: merchant,
      body: {
        scheduledFor: new Date(Date.now() + 5 * 60_000).toISOString(),
        stops: [
          { kind: 'PICKUP', address: 'Belgrano 1200', location: FIRMAT },
          { kind: 'DROPOFF', address: 'San Martín 850', location: FIRMAT },
        ],
      },
    });
    const jobId = res.json<{ id: string }>().id;
    expect(await jobStatus(jobId)).toBe('SCHEDULED');
    const result = await dispatch.tick();
    expect(result.activated).toBeGreaterThanOrEqual(1);
    expect(await jobStatus(jobId)).toBe('SEARCHING');
    await ctx.request({
      method: 'POST',
      url: `/jobs/${jobId}/cancel`,
      token: merchant,
      body: { reason: 'fin de prueba' },
    });
  });
});
