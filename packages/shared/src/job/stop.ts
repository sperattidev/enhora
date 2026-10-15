import { InvalidTransitionError, type Actor } from './status.js';

export const STOP_KINDS = ['PICKUP', 'DROPOFF', 'ERRAND', 'PURCHASE'] as const;
export type StopKind = (typeof STOP_KINDS)[number];

export const STOP_STATUSES = ['PENDING', 'EN_ROUTE', 'ARRIVED', 'DONE', 'FAILED'] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];

export const STOP_FAILURE_REASONS = ['CUSTOMER_ABSENT', 'WRONG_ADDRESS', 'REJECTED', 'OTHER'] as const;
export type StopFailureReason = (typeof STOP_FAILURE_REASONS)[number];

const STOP_TRANSITIONS: Record<StopStatus, readonly StopStatus[]> = {
  PENDING: ['EN_ROUTE'],
  EN_ROUTE: ['ARRIVED'],
  ARRIVED: ['DONE', 'FAILED'],
  DONE: [],
  FAILED: [],
};

export function isStopFinished(status: StopStatus): boolean {
  return status === 'DONE' || status === 'FAILED';
}

/** Index of the stop the courier must work on next, or -1 when every stop is finished. */
export function currentStopIndex(stops: readonly { status: StopStatus }[]): number {
  return stops.findIndex((s) => !isStopFinished(s.status));
}

/**
 * Validates advancing stop `index` to `to`. Stops are worked strictly in order,
 * so only the current stop can move.
 */
export function assertStopTransition(
  stops: readonly { status: StopStatus }[],
  index: number,
  to: StopStatus,
  actor: Actor,
): void {
  const stop = stops[index];
  const from = stop?.status ?? 'unknown';
  const allowedActor = actor === 'COURIER' || actor === 'ADMIN';
  if (!stop || !allowedActor || index !== currentStopIndex(stops) || !STOP_TRANSITIONS[stop.status].includes(to)) {
    throw new InvalidTransitionError(`stop[${index}]:${from}`, to, actor);
  }
}

/** True when every stop is finished, which lets the job move to COMPLETED. */
export function allStopsFinished(stops: readonly { status: StopStatus }[]): boolean {
  return stops.length > 0 && currentStopIndex(stops) === -1;
}
