import { assertJobTransition, InvalidTransitionError, type Actor, type JobStatus } from '@enhora/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import { jobEvents, jobs } from '../db/schema.js';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const STATUS_LABEL: Record<JobStatus, string> = {
  SCHEDULED: 'programado',
  SEARCHING: 'buscando cadete',
  ASSIGNED: 'asignado',
  IN_PROGRESS: 'en curso',
  COMPLETED: 'completado',
  CANCELLED: 'cancelado',
  EXPIRED: 'sin cadete',
};

export interface TransitionRequest {
  jobId: string;
  /** When set, the job must belong to this merchant (otherwise 404, never 403: do not leak existence). */
  merchantId?: string;
  /** When set, the job must be assigned to this courier (otherwise 404). */
  courierId?: string;
  to: JobStatus;
  actor: Actor;
  actorUserId: string | null;
  set?: Partial<typeof jobs.$inferInsert>;
  metadata?: Record<string, unknown>;
}

/**
 * The only way a job changes status. Locks the row, checks the state machine, updates and
 * appends the audit event, all inside the caller's transaction.
 */
export async function transitionJob(tx: Tx, req: TransitionRequest): Promise<JobStatus> {
  const scope = and(
    eq(jobs.id, req.jobId),
    req.merchantId ? eq(jobs.merchantId, req.merchantId) : undefined,
    req.courierId ? eq(jobs.courierId, req.courierId) : undefined,
  );
  const [job] = await tx.select({ status: jobs.status }).from(jobs).where(scope).for('update');
  if (!job) throw new NotFoundException('Envío inexistente');

  try {
    assertJobTransition(job.status, req.to, req.actor);
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      throw new ConflictException(`No se puede: el envío está ${STATUS_LABEL[job.status]}`);
    }
    throw error;
  }

  await tx
    .update(jobs)
    .set({ ...req.set, status: req.to })
    .where(eq(jobs.id, req.jobId));
  await tx.insert(jobEvents).values({
    jobId: req.jobId,
    actor: req.actor,
    actorUserId: req.actorUserId,
    fromStatus: job.status,
    toStatus: req.to,
    metadata: req.metadata ?? null,
  });
  return job.status;
}
