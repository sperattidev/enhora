import { describe, expect, it } from 'vitest';
import { rankCouriers, scoreCourier, type AssignmentPolicy, type CourierCandidate } from './assignment.js';

const policy: AssignmentPolicy = { maxConcurrentJobs: 2, maxDistanceMeters: 4_000, cashLimitCents: 5_000_000 };

const courier = (over: Partial<CourierCandidate> & { id: string }): CourierCandidate => ({
  distanceMeters: 1_000,
  rating: 4.5,
  acceptanceRate: 0.9,
  activeJobs: 0,
  cashInHandCents: 0,
  ...over,
});

describe('rankCouriers', () => {
  it('prefers the closer courier when everything else is equal', () => {
    const ranked = rankCouriers(
      [courier({ id: 'far', distanceMeters: 3_000 }), courier({ id: 'near', distanceMeters: 300 })],
      { cashToCollectCents: 0 },
      policy,
    );
    expect(ranked.map((c) => c.id)).toEqual(['near', 'far']);
  });

  it('excludes busy couriers and those too far away', () => {
    const ranked = rankCouriers(
      [courier({ id: 'busy', activeJobs: 2 }), courier({ id: 'away', distanceMeters: 9_000 }), courier({ id: 'ok' })],
      { cashToCollectCents: 0 },
      policy,
    );
    expect(ranked.map((c) => c.id)).toEqual(['ok']);
  });

  it('skips couriers that would exceed the cash limit only on cash jobs', () => {
    const loaded = courier({ id: 'loaded', cashInHandCents: 4_500_000 });
    expect(rankCouriers([loaded], { cashToCollectCents: 1_000_000 }, policy)).toEqual([]);
    expect(rankCouriers([loaded], { cashToCollectCents: 0 }, policy)).toHaveLength(1);
  });

  it('breaks ties deterministically', () => {
    const ranked = rankCouriers([courier({ id: 'b' }), courier({ id: 'a' })], { cashToCollectCents: 0 }, policy);
    expect(ranked.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('scoreCourier', () => {
  it('stays between 0 and 1', () => {
    const best = scoreCourier(courier({ id: 'x', distanceMeters: 0, rating: 5, acceptanceRate: 1 }), policy);
    const worst = scoreCourier(
      courier({ id: 'y', distanceMeters: 4_000, rating: 1, acceptanceRate: 0, activeJobs: 2 }),
      policy,
    );
    expect(best).toBeCloseTo(1);
    expect(worst).toBeCloseTo(0);
  });

  it('gives new couriers a fair chance', () => {
    const fresh = scoreCourier(courier({ id: 'new', rating: null, acceptanceRate: null }), policy);
    const veteran = scoreCourier(courier({ id: 'old', rating: 4, acceptanceRate: 0.8 }), policy);
    expect(fresh).toBeCloseTo(veteran);
  });
});
