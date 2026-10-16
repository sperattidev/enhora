import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { DB, type Database } from '../db/db.module.js';
import { couriers, jobs, merchants, sessions, stops, users } from '../db/schema.js';

type KycStatus = (typeof couriers.$inferSelect)['kycStatus'];
type MerchantStatus = (typeof merchants.$inferSelect)['status'];
type UserStatus = (typeof users.$inferSelect)['status'];

const ACTIVE_STATUSES = ['SCHEDULED', 'SEARCHING', 'ASSIGNED', 'IN_PROGRESS', 'EXPIRED'] as const;
/** "Today" for the dashboard is the Argentine calendar day, whatever the server time zone. */
const TZ = 'America/Argentina/Buenos_Aires';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async overview() {
    const staleCutoff = new Date(Date.now() - this.env.COURIER_STALE_SECONDS * 1000).toISOString();
    const [row] = await this.db.execute<Record<string, string>>(sql`
      with today as (select date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ} as start)
      select
        (select count(*) from jobs where status = 'SCHEDULED') as scheduled,
        (select count(*) from jobs where status = 'SEARCHING') as searching,
        (select count(*) from jobs where status = 'ASSIGNED') as assigned,
        (select count(*) from jobs where status = 'IN_PROGRESS') as "inProgress",
        (select count(*) from jobs where status = 'EXPIRED') as expired,
        (select count(*) from jobs, today where status = 'COMPLETED' and completed_at >= today.start) as "completedToday",
        (select count(*) from jobs, today where status = 'CANCELLED' and cancelled_at >= today.start) as "cancelledToday",
        (select coalesce(sum(price_cents), 0) from jobs, today where status = 'COMPLETED' and completed_at >= today.start) as "deliveredValueToday",
        (select count(*) from couriers where kyc_status = 'APPROVED' and online and last_seen_at > ${staleCutoff}::timestamptz) as "couriersOnline",
        (select count(*) from couriers where kyc_status = 'APPROVED') as "couriersApproved",
        (select coalesce(sum(cash_in_hand_cents), 0) from couriers) as "cashInHands",
        (select count(*) from couriers where kyc_status = 'PENDING') as "pendingCouriers",
        (select count(*) from merchants where status = 'PENDING') as "pendingMerchants",
        (select count(*) from merchants where status = 'ACTIVE') as "activeMerchants"`);
    // Postgres returns counts as bigint strings.
    return Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k, Number(v)]));
  }

  /** Recent jobs across every merchant, for the operations view. */
  async listJobs(scope: 'active' | 'all', limit: number) {
    const rows = await this.db
      .select({
        id: jobs.id,
        status: jobs.status,
        priceCents: jobs.priceCents,
        merchantName: merchants.displayName,
        courierName: couriers.fullName,
        scheduledFor: jobs.scheduledFor,
        searchingSince: jobs.searchingSince,
        createdAt: jobs.createdAt,
        trackingToken: jobs.trackingToken,
      })
      .from(jobs)
      .innerJoin(merchants, eq(merchants.id, jobs.merchantId))
      .leftJoin(couriers, eq(couriers.id, jobs.courierId))
      .where(scope === 'active' ? inArray(jobs.status, ACTIVE_STATUSES) : undefined)
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
    if (rows.length === 0) return [];
    const jobStops = await this.db
      .select({ jobId: stops.jobId, kind: stops.kind, status: stops.status, address: stops.address })
      .from(stops)
      .where(
        inArray(
          stops.jobId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(stops.position));
    return rows.map((r) => {
      const own = jobStops.filter((s) => s.jobId === r.id);
      return {
        ...r,
        destination: own.at(-1)?.address ?? null,
        stops: own.map(({ kind, status }) => ({ kind, status })),
      };
    });
  }

  listCouriers(kycStatus: KycStatus) {
    return this.db
      .select({
        id: couriers.id,
        userId: couriers.userId,
        fullName: couriers.fullName,
        dni: couriers.dni,
        vehicle: couriers.vehicle,
        kycStatus: couriers.kycStatus,
        email: users.email,
        phone: users.phone,
        createdAt: couriers.createdAt,
      })
      .from(couriers)
      .innerJoin(users, eq(users.id, couriers.userId))
      .where(eq(couriers.kycStatus, kycStatus))
      .orderBy(asc(couriers.createdAt))
      .limit(200);
  }

  async setCourierKyc(id: string, kycStatus: KycStatus): Promise<boolean> {
    // A courier who is no longer approved must not keep receiving offers.
    const rows = await this.db
      .update(couriers)
      .set(kycStatus === 'APPROVED' ? { kycStatus } : { kycStatus, online: false })
      .where(eq(couriers.id, id))
      .returning({ id: couriers.id });
    return rows.length > 0;
  }

  listMerchants(status: MerchantStatus) {
    return this.db
      .select({
        id: merchants.id,
        legalName: merchants.legalName,
        displayName: merchants.displayName,
        cuit: merchants.cuit,
        phone: merchants.phone,
        address: merchants.address,
        status: merchants.status,
        createdAt: merchants.createdAt,
      })
      .from(merchants)
      .where(eq(merchants.status, status))
      .orderBy(asc(merchants.createdAt))
      .limit(200);
  }

  async setMerchantStatus(id: string, status: MerchantStatus): Promise<boolean> {
    const rows = await this.db
      .update(merchants)
      .set({ status })
      .where(eq(merchants.id, id))
      .returning({ id: merchants.id });
    return rows.length > 0;
  }

  /** Suspending a user also revokes every open session, so refresh stops working immediately. */
  async setUserStatus(id: string, status: UserStatus): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.update(users).set({ status }).where(eq(users.id, id)).returning({ id: users.id });
      if (rows.length === 0) return false;
      if (status === 'SUSPENDED') {
        await tx
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
      }
      return true;
    });
  }
}
