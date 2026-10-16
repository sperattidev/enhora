import type { JobStatus, StopKind, StopStatus } from '@enhora/shared';

/** How long the public tracking link keeps working after the job ends. */
export const TRACKING_TTL_AFTER_END_MS = 24 * 60 * 60 * 1000;

export interface TrackingSource {
  status: JobStatus;
  merchantName: string;
  courierFullName: string | null;
  scheduledFor: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  stops: { kind: StopKind; status: StopStatus }[];
}

export interface TrackingView {
  status: JobStatus;
  merchantName: string;
  /** First name only: the recipient needs to recognise the courier, not identify them. */
  courierName: string | null;
  scheduledFor: Date | null;
  createdAt: Date;
  finishedAt: Date | null;
  stops: { kind: StopKind; status: StopStatus }[];
}

/**
 * Builds the public tracking page data. Returns null once the link has expired.
 * Never exposes addresses, phones, delivery codes or amounts.
 */
export function toTrackingView(job: TrackingSource, now: Date): TrackingView | null {
  const finishedAt = job.completedAt ?? job.cancelledAt;
  if (finishedAt && now.getTime() - finishedAt.getTime() > TRACKING_TTL_AFTER_END_MS) return null;
  return {
    status: job.status,
    merchantName: job.merchantName,
    courierName: job.courierFullName?.trim().split(/\s+/)[0] ?? null,
    scheduledFor: job.scheduledFor,
    createdAt: job.createdAt,
    finishedAt,
    stops: job.stops.map((s) => ({ kind: s.kind, status: s.status })),
  };
}
