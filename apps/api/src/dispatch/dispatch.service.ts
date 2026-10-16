import type { CourierCandidate } from '@enhora/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, lte, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { DB, type Database } from '../db/db.module.js';
import { jobs, offers } from '../db/schema.js';
import { transitionJob, type Tx } from '../jobs/transitions.js';
import { decideDispatch, policyFromEnv, type DispatchPolicy } from './policy.js';

const BATCH = 50;

export interface TickResult {
  expiredOffers: number;
  activated: number;
  offered: number;
  expiredJobs: number;
}

/**
 * Assigns couriers to jobs: one offer at a time per job, one offer at a time per courier.
 * Every step uses row locks with SKIP LOCKED, so running several API instances is safe.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);
  readonly policy: DispatchPolicy;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
  ) {
    this.policy = policyFromEnv(env);
  }

  async tick(now = new Date()): Promise<TickResult> {
    const expiredOffers = await this.expireOffers(now);
    const activated = await this.activateScheduled(now);
    const { offered, expiredJobs } = await this.dispatchSearching(now);
    return { expiredOffers, activated, offered, expiredJobs };
  }

  private async expireOffers(now: Date): Promise<number> {
    const rows = await this.db
      .update(offers)
      .set({ status: 'EXPIRED', respondedAt: now })
      .where(and(eq(offers.status, 'PENDING'), lte(offers.expiresAt, now)))
      .returning({ id: offers.id });
    return rows.length;
  }

  private async activateScheduled(now: Date): Promise<number> {
    const due = new Date(now.getTime() + this.policy.scheduleLeadMs);
    const rows = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.status, 'SCHEDULED'), lte(jobs.scheduledFor, due)))
      .limit(BATCH);
    let activated = 0;
    for (const { id } of rows) {
      const ok = await this.withJobLock(id, 'SCHEDULED', (tx) =>
        transitionJob(tx, {
          jobId: id,
          to: 'SEARCHING',
          actor: 'SYSTEM',
          actorUserId: null,
          set: { searchingSince: now },
        }),
      );
      if (ok) activated++;
    }
    return activated;
  }

  private async dispatchSearching(now: Date): Promise<{ offered: number; expiredJobs: number }> {
    const rows = await this.db.execute<{ id: string }>(sql`
      select j.id from ${jobs} j
      where j.status = 'SEARCHING'
        and not exists (select 1 from ${offers} o where o.job_id = j.id and o.status = 'PENDING')
      order by j.searching_since nulls first
      limit ${BATCH}`);

    let offered = 0;
    let expiredJobs = 0;
    for (const { id } of rows) {
      await this.withJobLock(id, 'SEARCHING', async (tx) => {
        const job = await this.loadSearchingJob(tx, id);
        if (!job) return;
        const [candidates, alreadyOffered] = await Promise.all([
          this.candidates(tx, job, now),
          this.alreadyOffered(tx, id, job.searchingSince),
        ]);
        const decision = decideDispatch(job, candidates, alreadyOffered, this.policy, now);

        if (decision.type === 'offer') {
          await tx.insert(offers).values({
            jobId: id,
            courierId: decision.courierId,
            offeredAt: now,
            expiresAt: new Date(now.getTime() + this.policy.offerTtlMs),
          });
          offered++;
        } else if (decision.type === 'expire') {
          await transitionJob(tx, {
            jobId: id,
            to: 'EXPIRED',
            actor: 'SYSTEM',
            actorUserId: null,
            set: { searchingSince: null },
            metadata: { reason: 'no_courier_accepted' },
          });
          expiredJobs++;
        }
      });
    }
    return { offered, expiredJobs };
  }

  /** Runs `work` holding the job row lock, skipping jobs another worker is already handling. */
  private async withJobLock(jobId: string, status: string, work: (tx: Tx) => Promise<unknown>): Promise<boolean> {
    try {
      return await this.db.transaction(async (tx) => {
        const locked = await tx.execute(sql`
          select 1 from ${jobs} where id = ${jobId} and status = ${status} for update skip locked`);
        if (locked.length === 0) return false;
        await work(tx);
        return true;
      });
    } catch (error) {
      this.logger.error(`Dispatch failed for job ${jobId}: ${(error as Error).message}`);
      return false;
    }
  }

  private async loadSearchingJob(tx: Tx, jobId: string) {
    const [row] = await tx.execute<{
      cityId: string;
      searchingSince: Date | string | null;
      createdAt: Date | string;
      lng: number;
      lat: number;
      cash: string;
    }>(sql`
      select j.city_id as "cityId", j.searching_since as "searchingSince", j.created_at as "createdAt",
             ST_X(s.location) as lng, ST_Y(s.location) as lat,
             (select coalesce(sum(cash_to_collect_cents), 0) from stops where job_id = j.id) as cash
      from ${jobs} j join stops s on s.job_id = j.id and s.position = 0
      where j.id = ${jobId}`);
    if (!row) return null;
    return {
      cityId: row.cityId,
      searchingSince: new Date(row.searchingSince ?? row.createdAt),
      origin: { lng: Number(row.lng), lat: Number(row.lat) },
      cashToCollectCents: Number(row.cash),
    };
  }

  /** Approved, online, recently seen couriers near the first stop who are not holding another offer. */
  private async candidates(
    tx: Tx,
    job: { cityId: string; origin: { lng: number; lat: number } },
    now: Date,
  ): Promise<CourierCandidate[]> {
    const staleCutoff = new Date(now.getTime() - this.policy.staleAfterMs);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const origin = sql`ST_SetSRID(ST_MakePoint(${job.origin.lng}::float8, ${job.origin.lat}::float8), 4326)`;
    const rows = await tx.execute<{
      id: string;
      distance: number;
      rating: number | null;
      acceptance: number | null;
      activeJobs: number;
      cash: string;
    }>(sql`
      select c.id,
             ST_DistanceSphere(c.last_location, ${origin}) as distance,
             case when c.rating_count > 0 then c.rating_sum::float8 / c.rating_count end as rating,
             (select count(*) filter (where o.status = 'ACCEPTED')::float8 / nullif(count(*), 0)
                from offers o
               where o.courier_id = c.id and o.status in ('ACCEPTED', 'REJECTED', 'EXPIRED') and o.offered_at > ${monthAgo.toISOString()}::timestamptz) as acceptance,
             (select count(*)::int from jobs aj
               where aj.courier_id = c.id and aj.status in ('ASSIGNED', 'IN_PROGRESS')) as "activeJobs",
             c.cash_in_hand_cents as cash
      from couriers c
      join users u on u.id = c.user_id
      where c.city_id = ${job.cityId}
        and c.kyc_status = 'APPROVED'
        and c.online
        and u.status = 'ACTIVE'
        and c.last_location is not null
        and c.last_seen_at > ${staleCutoff.toISOString()}::timestamptz
        and ST_DWithin(c.last_location::geography, ${origin}::geography, ${this.policy.maxDistanceMeters})
        and not exists (select 1 from offers po where po.courier_id = c.id and po.status = 'PENDING')`);
    return rows.map((r) => ({
      id: r.id,
      distanceMeters: Number(r.distance),
      rating: r.rating === null ? null : Number(r.rating),
      acceptanceRate: r.acceptance === null ? null : Number(r.acceptance),
      activeJobs: Number(r.activeJobs),
      cashInHandCents: Number(r.cash),
    }));
  }

  /**
   * Couriers excluded from this search: everyone offered since it started, plus anyone who
   * accepted this job before and released it.
   */
  private async alreadyOffered(tx: Tx, jobId: string, searchingSince: Date): Promise<Set<string>> {
    const rows = await tx
      .select({ courierId: offers.courierId })
      .from(offers)
      .where(
        and(
          eq(offers.jobId, jobId),
          sql`(${offers.offeredAt} >= ${searchingSince.toISOString()}::timestamptz or ${offers.status} = 'ACCEPTED')`,
        ),
      );
    return new Set(rows.map((r) => r.courierId));
  }
}
