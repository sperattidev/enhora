import { describe, expect, it } from 'vitest';
import { InvalidTransitionError } from './status.js';
import { allStopsFinished, assertStopTransition, currentStopIndex, type StopStatus } from './stop.js';

const stops = (...statuses: StopStatus[]) => statuses.map((status) => ({ status }));

describe('stops', () => {
  it('points at the first unfinished stop', () => {
    expect(currentStopIndex(stops('DONE', 'FAILED', 'PENDING', 'PENDING'))).toBe(2);
    expect(currentStopIndex(stops('DONE', 'DONE'))).toBe(-1);
  });

  it('lets the courier advance the current stop', () => {
    expect(() => assertStopTransition(stops('DONE', 'ARRIVED'), 1, 'DONE', 'COURIER')).not.toThrow();
  });

  it('forbids working stops out of order', () => {
    expect(() => assertStopTransition(stops('PENDING', 'PENDING'), 1, 'EN_ROUTE', 'COURIER')).toThrow(
      InvalidTransitionError,
    );
  });

  it('forbids skipping steps within a stop', () => {
    expect(() => assertStopTransition(stops('PENDING'), 0, 'DONE', 'COURIER')).toThrow(InvalidTransitionError);
  });

  it('forbids merchants from moving stops', () => {
    expect(() => assertStopTransition(stops('PENDING'), 0, 'EN_ROUTE', 'MERCHANT')).toThrow(InvalidTransitionError);
  });

  it('rejects a stop index that does not exist', () => {
    expect(() => assertStopTransition(stops('PENDING'), 3, 'EN_ROUTE', 'COURIER')).toThrow(InvalidTransitionError);
  });

  it('knows when a job can complete', () => {
    expect(allStopsFinished(stops('DONE', 'FAILED'))).toBe(true);
    expect(allStopsFinished(stops('DONE', 'ARRIVED'))).toBe(false);
    expect(allStopsFinished([])).toBe(false);
  });
});
