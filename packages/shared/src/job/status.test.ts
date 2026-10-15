import { describe, expect, it } from 'vitest';
import {
  assertJobTransition,
  canTransitionJob,
  InvalidTransitionError,
  isTerminalJobStatus,
  nextJobStatuses,
} from './status.js';

describe('job status machine', () => {
  it('lets the system assign a searching job', () => {
    expect(canTransitionJob('SEARCHING', 'ASSIGNED', 'SYSTEM')).toBe(true);
  });

  it('does not let a merchant assign a courier by itself', () => {
    expect(canTransitionJob('SEARCHING', 'ASSIGNED', 'MERCHANT')).toBe(false);
  });

  it('lets the merchant cancel before pickup', () => {
    for (const from of ['SCHEDULED', 'SEARCHING', 'ASSIGNED', 'EXPIRED'] as const) {
      expect(canTransitionJob(from, 'CANCELLED', 'MERCHANT')).toBe(true);
    }
  });

  it('never cancels a job that is already picked up, not even an admin', () => {
    expect(canTransitionJob('IN_PROGRESS', 'CANCELLED', 'MERCHANT')).toBe(false);
    expect(canTransitionJob('IN_PROGRESS', 'CANCELLED', 'ADMIN')).toBe(false);
  });

  it('lets the courier release an assigned job back to searching', () => {
    expect(canTransitionJob('ASSIGNED', 'SEARCHING', 'COURIER')).toBe(true);
  });

  it('lets an admin force any listed transition', () => {
    expect(canTransitionJob('SEARCHING', 'EXPIRED', 'ADMIN')).toBe(true);
  });

  it('treats completed and cancelled as terminal', () => {
    expect(isTerminalJobStatus('COMPLETED')).toBe(true);
    expect(isTerminalJobStatus('CANCELLED')).toBe(true);
    expect(isTerminalJobStatus('EXPIRED')).toBe(false);
    expect(nextJobStatuses('COMPLETED', 'ADMIN')).toEqual([]);
  });

  it('throws a typed error on invalid transitions', () => {
    expect(() => assertJobTransition('COMPLETED', 'SEARCHING', 'ADMIN')).toThrow(InvalidTransitionError);
  });

  it('lists what each actor can do next', () => {
    expect(nextJobStatuses('ASSIGNED', 'COURIER')).toEqual(['IN_PROGRESS', 'SEARCHING']);
    expect(nextJobStatuses('ASSIGNED', 'MERCHANT')).toEqual(['CANCELLED']);
  });
});
