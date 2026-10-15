export interface CourierCandidate {
  id: string;
  /** Straight-line distance from the courier to the first stop. */
  distanceMeters: number;
  /** Average rating from 1 to 5; null for new couriers. */
  rating: number | null;
  /** Share of offers accepted in the last 30 days, 0 to 1; null for new couriers. */
  acceptanceRate: number | null;
  activeJobs: number;
  cashInHandCents: number;
}

export interface AssignmentPolicy {
  maxConcurrentJobs: number;
  /** Couriers farther than this are not offered the job. */
  maxDistanceMeters: number;
  cashLimitCents: number;
}

export interface JobForAssignment {
  cashToCollectCents: number;
}

export const SCORE_WEIGHTS = { distance: 0.5, rating: 0.25, acceptance: 0.15, load: 0.1 } as const;

/** Neutral values so new couriers are neither favoured nor buried. */
const NEW_COURIER_RATING = 4;
const NEW_COURIER_ACCEPTANCE = 0.8;

export function isEligible(c: CourierCandidate, job: JobForAssignment, policy: AssignmentPolicy): boolean {
  if (c.activeJobs >= policy.maxConcurrentJobs) return false;
  if (c.distanceMeters > policy.maxDistanceMeters) return false;
  if (job.cashToCollectCents > 0 && c.cashInHandCents + job.cashToCollectCents > policy.cashLimitCents) return false;
  return true;
}

/** Score from 0 to 1; higher is better. */
export function scoreCourier(c: CourierCandidate, policy: AssignmentPolicy): number {
  const distance = 1 - Math.min(c.distanceMeters / policy.maxDistanceMeters, 1);
  const rating = ((c.rating ?? NEW_COURIER_RATING) - 1) / 4;
  const acceptance = c.acceptanceRate ?? NEW_COURIER_ACCEPTANCE;
  const load = 1 - Math.min(c.activeJobs / policy.maxConcurrentJobs, 1);
  return (
    SCORE_WEIGHTS.distance * distance +
    SCORE_WEIGHTS.rating * rating +
    SCORE_WEIGHTS.acceptance * acceptance +
    SCORE_WEIGHTS.load * load
  );
}

/** Eligible couriers in the order they should receive the offer. */
export function rankCouriers(
  candidates: readonly CourierCandidate[],
  job: JobForAssignment,
  policy: AssignmentPolicy,
): CourierCandidate[] {
  return candidates
    .filter((c) => isEligible(c, job, policy))
    .map((c) => ({ c, score: scoreCourier(c, policy) }))
    .sort((a, b) => b.score - a.score || a.c.distanceMeters - b.c.distanceMeters || a.c.id.localeCompare(b.c.id))
    .map(({ c }) => c);
}
