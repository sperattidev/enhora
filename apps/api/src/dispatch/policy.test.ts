import type { CourierCandidate } from '@enhora/shared';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import { decideDispatch, policyFromEnv } from './policy.js';

const policy = policyFromEnv(loadEnv({ DATABASE_URL: 'postgres://localhost/x', JWT_ACCESS_SECRET: 'x'.repeat(32) }));
const now = new Date('2026-10-15T20:00:00Z');
const job = { searchingSince: new Date(now.getTime() - 60_000), cashToCollectCents: 0 };

const courier = (id: string, distanceMeters: number): CourierCandidate => ({
  id,
  distanceMeters,
  rating: 4.5,
  acceptanceRate: 0.9,
  activeJobs: 0,
  cashInHandCents: 0,
});

describe('decideDispatch', () => {
  it('offers to the best ranked courier', () => {
    const decision = decideDispatch(job, [courier('far', 3_000), courier('near', 200)], new Set(), policy, now);
    expect(decision).toEqual({ type: 'offer', courierId: 'near' });
  });

  it('never offers the same job twice to one courier in a search', () => {
    const decision = decideDispatch(job, [courier('far', 3_000), courier('near', 200)], new Set(['near']), policy, now);
    expect(decision).toEqual({ type: 'offer', courierId: 'far' });
  });

  it('waits for couriers while the search is young', () => {
    expect(decideDispatch(job, [], new Set(), policy, now)).toEqual({ type: 'wait' });
  });

  it('expires once the search timed out with nobody left', () => {
    const old = { ...job, searchingSince: new Date(now.getTime() - policy.searchTimeoutMs) };
    expect(decideDispatch(old, [courier('a', 100)], new Set(['a']), policy, now)).toEqual({ type: 'expire' });
  });

  it('still offers after the timeout if someone new is available', () => {
    const old = { ...job, searchingSince: new Date(now.getTime() - policy.searchTimeoutMs * 2) };
    expect(decideDispatch(old, [courier('b', 100)], new Set(), policy, now)).toEqual({ type: 'offer', courierId: 'b' });
  });

  it('respects the cash limit', () => {
    const loaded = { ...courier('loaded', 100), cashInHandCents: policy.cashLimitCents };
    const cashJob = { ...job, cashToCollectCents: 1 };
    expect(decideDispatch(cashJob, [loaded], new Set(), policy, now)).toEqual({ type: 'wait' });
  });

  it('reads the defaults from the environment', () => {
    expect(policy).toMatchObject({ offerTtlMs: 30_000, maxConcurrentJobs: 2, maxDistanceMeters: 5_000 });
  });
});
