import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Wrong delivery codes allowed per stop before it locks and the merchant has to step in. */
export const MAX_CODE_ATTEMPTS = 5;

/** Constant-time comparison so response timing reveals nothing about the right code. */
export function codesMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 192-bit token for the public tracking URL: unguessable, URL-safe. */
export function newTrackingToken(): string {
  return randomBytes(24).toString('base64url');
}

/** 4-digit code the recipient reads to the courier. Leading zeros are kept. */
export function newDeliveryCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, '0');
}
