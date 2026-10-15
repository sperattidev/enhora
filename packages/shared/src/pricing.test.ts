import { describe, expect, it } from 'vitest';
import { OutOfCoverageError, quoteJob, waitFee, type PricingRules } from './pricing.js';

const rules: PricingRules = {
  zoneFees: { centro: 250_000, barrios: 350_000, rural: 600_000 },
  extraStopFee: 150_000,
  errandFee: 200_000,
  surchargeBps: 0,
  roundToCents: 5_000,
  freeWaitMinutes: 5,
  waitFeePerMinute: 10_000,
};

describe('quoteJob', () => {
  it('charges the destination zone for a simple delivery', () => {
    const q = quoteJob(
      [
        { kind: 'PICKUP', zoneId: 'centro' },
        { kind: 'DROPOFF', zoneId: 'barrios' },
      ],
      rules,
    );
    expect(q.total).toBe(350_000);
  });

  it('adds extra stops from the third one on', () => {
    const q = quoteJob(
      [
        { kind: 'PICKUP', zoneId: 'centro' },
        { kind: 'DROPOFF', zoneId: 'centro' },
        { kind: 'DROPOFF', zoneId: 'centro' },
        { kind: 'DROPOFF', zoneId: 'barrios' },
      ],
      rules,
    );
    expect(q).toMatchObject({ base: 350_000, extraStops: 300_000, total: 650_000 });
  });

  it('adds the errand fee for errands and purchases', () => {
    const q = quoteJob([{ kind: 'ERRAND', zoneId: 'centro' }], rules);
    expect(q.total).toBe(450_000);
  });

  it('applies the surcharge and rounds up', () => {
    const q = quoteJob(
      [
        { kind: 'PICKUP', zoneId: 'centro' },
        { kind: 'DROPOFF', zoneId: 'centro' },
      ],
      { ...rules, surchargeBps: 1_500 },
    );
    expect(q.surcharge).toBe(37_500);
    expect(q.total).toBe(290_000);
    expect(q.rounding).toBe(2_500);
  });

  it('reports which stops are out of coverage', () => {
    const run = () =>
      quoteJob(
        [
          { kind: 'PICKUP', zoneId: 'centro' },
          { kind: 'DROPOFF', zoneId: null },
          { kind: 'DROPOFF', zoneId: 'luna' },
        ],
        rules,
      );
    expect(run).toThrow(OutOfCoverageError);
    try {
      run();
    } catch (e) {
      expect((e as OutOfCoverageError).stopIndexes).toEqual([1, 2]);
    }
  });

  it('only returns whole cents', () => {
    const q = quoteJob([{ kind: 'PICKUP', zoneId: 'centro' }], { ...rules, surchargeBps: 333, roundToCents: 0 });
    expect(Number.isInteger(q.total)).toBe(true);
  });
});

describe('waitFee', () => {
  it('is free within the grace period', () => {
    expect(waitFee(5, rules)).toBe(0);
  });

  it('charges every full minute after the grace period', () => {
    expect(waitFee(12.9, rules)).toBe(70_000);
  });
});
