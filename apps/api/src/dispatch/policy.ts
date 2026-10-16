import { rankCouriers, type AssignmentPolicy, type CourierCandidate } from '@enhora/shared';
import type { Env } from '../config/env.js';

export interface DispatchPolicy extends AssignmentPolicy {
  offerTtlMs: number;
  searchTimeoutMs: number;
  scheduleLeadMs: number;
  staleAfterMs: number;
}

export function policyFromEnv(env: Env): DispatchPolicy {
  return {
    maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
    maxDistanceMeters: env.MAX_OFFER_DISTANCE_METERS,
    cashLimitCents: env.COURIER_CASH_LIMIT_CENTS,
    offerTtlMs: env.OFFER_TTL_SECONDS * 1000,
    searchTimeoutMs: env.SEARCH_TIMEOUT_MINUTES * 60_000,
    scheduleLeadMs: env.SCHEDULE_LEAD_MINUTES * 60_000,
    staleAfterMs: env.COURIER_STALE_SECONDS * 1000,
  };
}

export type DispatchDecision = { type: 'offer'; courierId: string } | { type: 'expire' } | { type: 'wait' };

export interface SearchingJob {
  searchingSince: Date;
  cashToCollectCents: number;
}

/**
 * What to do with a job that is searching and has no live offer.
 * Couriers that already saw this offer are excluded: nobody gets the same job twice in a search.
 * With nobody left, keep waiting for couriers to come online until the search times out.
 */
export function decideDispatch(
  job: SearchingJob,
  candidates: readonly CourierCandidate[],
  alreadyOffered: ReadonlySet<string>,
  policy: DispatchPolicy,
  now: Date,
): DispatchDecision {
  const fresh = candidates.filter((c) => !alreadyOffered.has(c.id));
  const [best] = rankCouriers(fresh, { cashToCollectCents: job.cashToCollectCents }, policy);
  if (best) return { type: 'offer', courierId: best.id };
  if (now.getTime() - job.searchingSince.getTime() >= policy.searchTimeoutMs) return { type: 'expire' };
  return { type: 'wait' };
}
