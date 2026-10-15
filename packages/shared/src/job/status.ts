export const JOB_STATUSES = [
  'SCHEDULED',
  'SEARCHING',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ACTORS = ['SYSTEM', 'MERCHANT', 'COURIER', 'ADMIN'] as const;
export type Actor = (typeof ACTORS)[number];

interface Transition {
  to: JobStatus;
  /** Actors allowed to trigger it. ADMIN can always trigger any listed transition. */
  by: readonly Actor[];
}

const TRANSITIONS: Record<JobStatus, readonly Transition[]> = {
  SCHEDULED: [
    { to: 'SEARCHING', by: ['SYSTEM'] },
    { to: 'CANCELLED', by: ['MERCHANT'] },
  ],
  SEARCHING: [
    { to: 'ASSIGNED', by: ['SYSTEM'] },
    { to: 'EXPIRED', by: ['SYSTEM'] },
    { to: 'CANCELLED', by: ['MERCHANT'] },
  ],
  ASSIGNED: [
    { to: 'IN_PROGRESS', by: ['COURIER'] },
    { to: 'SEARCHING', by: ['COURIER'] },
    { to: 'CANCELLED', by: ['MERCHANT'] },
  ],
  IN_PROGRESS: [{ to: 'COMPLETED', by: ['SYSTEM'] }],
  EXPIRED: [
    { to: 'SEARCHING', by: ['MERCHANT'] },
    { to: 'CANCELLED', by: ['MERCHANT'] },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ['COMPLETED', 'CANCELLED'];

export function isTerminalJobStatus(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

export function canTransitionJob(from: JobStatus, to: JobStatus, actor: Actor): boolean {
  const transition = TRANSITIONS[from].find((t) => t.to === to);
  if (!transition) return false;
  return actor === 'ADMIN' || transition.by.includes(actor);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
    readonly actor: Actor,
  ) {
    super(`Transition ${from} -> ${to} is not allowed for ${actor}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertJobTransition(from: JobStatus, to: JobStatus, actor: Actor): void {
  if (!canTransitionJob(from, to, actor)) throw new InvalidTransitionError(from, to, actor);
}

export function nextJobStatuses(from: JobStatus, actor: Actor): JobStatus[] {
  return TRANSITIONS[from].filter((t) => actor === 'ADMIN' || t.by.includes(actor)).map((t) => t.to);
}
