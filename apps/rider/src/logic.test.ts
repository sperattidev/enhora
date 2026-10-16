import { describe, expect, it } from 'vitest';
import {
  canRelease,
  currentStopIndex,
  directionsLink,
  LOCATION_INTERVAL_MS,
  nextAction,
  secondsLeft,
  shouldSendLocation,
} from './logic';

describe('nextAction', () => {
  it('walks a stop forward one step at a time', () => {
    expect(nextAction({ kind: 'PICKUP', status: 'PENDING' })).toMatchObject({ to: 'EN_ROUTE' });
    expect(nextAction({ kind: 'PICKUP', status: 'EN_ROUTE' })).toMatchObject({ to: 'ARRIVED', label: 'Llegué' });
    expect(nextAction({ kind: 'PICKUP', status: 'ARRIVED' })).toMatchObject({ to: 'DONE', label: 'Retiré el pedido' });
  });

  it('asks for the code only on deliveries', () => {
    expect(nextAction({ kind: 'DROPOFF', status: 'ARRIVED' })).toMatchObject({ needsCode: true, label: 'Entregué' });
    expect(nextAction({ kind: 'ERRAND', status: 'ARRIVED' })?.needsCode).toBe(false);
  });

  it('has nothing to do on finished stops', () => {
    expect(nextAction({ kind: 'DROPOFF', status: 'DONE' })).toBeNull();
    expect(nextAction({ kind: 'DROPOFF', status: 'FAILED' })).toBeNull();
  });
});

describe('offers and stops', () => {
  it('counts down whole seconds and never below zero', () => {
    const now = Date.parse('2026-10-15T20:00:00Z');
    expect(secondsLeft('2026-10-15T20:00:29.200Z', now)).toBe(30);
    expect(secondsLeft('2026-10-15T19:59:00Z', now)).toBe(0);
  });

  it('finds the current stop', () => {
    expect(currentStopIndex([{ status: 'DONE' }, { status: 'FAILED' }, { status: 'PENDING' }])).toBe(2);
    expect(currentStopIndex([{ status: 'DONE' }])).toBe(-1);
  });

  it('only allows releasing before pickup', () => {
    expect(canRelease([{ status: 'EN_ROUTE' }, { status: 'PENDING' }])).toBe(true);
    expect(canRelease([{ status: 'DONE' }, { status: 'PENDING' }])).toBe(false);
  });

  it('links to directions', () => {
    expect(directionsLink({ lat: -33.45, lng: -61.48 })).toContain('destination=-33.45,-61.48');
  });
});

describe('shouldSendLocation', () => {
  it('throttles GPS updates', () => {
    expect(shouldSendLocation(null, 0)).toBe(true);
    expect(shouldSendLocation(1_000, 1_000 + LOCATION_INTERVAL_MS - 1)).toBe(false);
    expect(shouldSendLocation(1_000, 1_000 + LOCATION_INTERVAL_MS)).toBe(true);
  });
});
