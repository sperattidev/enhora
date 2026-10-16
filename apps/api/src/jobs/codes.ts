import { randomBytes, randomInt } from 'node:crypto';

/** 192-bit token for the public tracking URL: unguessable, URL-safe. */
export function newTrackingToken(): string {
  return randomBytes(24).toString('base64url');
}

/** 4-digit code the recipient reads to the courier. Leading zeros are kept. */
export function newDeliveryCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, '0');
}
