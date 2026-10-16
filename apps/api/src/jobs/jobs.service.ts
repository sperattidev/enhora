import type { CreateJobInput, JobStatus, ListJobsQuery, Quote } from '@enhora/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import { DB, type Database } from '../db/db.module.js';
import { couriers, jobEvents, jobs, merchants, offers, stops } from '../db/schema.js';
import { ZonesService } from '../zones/zones.service.js';
import { newDeliveryCode, newTrackingToken } from './codes.js';
import { MerchantContextService } from './merchant-context.js';
import { transitionJob } from './transitions.js';
import { toTrackingView, type TrackingView } from './views.js';

const stopColumns = {
  id: stops.id,
  position: stops.position,
  kind: stops.kind,
  status: stops.status,
  address: stops.address,
  location: stops.location,
  contactName: stops.contactName,
  contactPhone: stops.contactPhone,
  instructions: stops.instructions,
  cashToCollectCents: stops.cashToCollectCents,
  maxSpendCents: stops.maxSpendCents,
  deliveryCode: stops.deliveryCode,
  failureReason: stops.failureReason,
  arrivedAt: stops.arrivedAt,
  finishedAt: stops.finishedAt,
};

@Injectable()
export class JobsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly zones: ZonesService,
    private readonly merchants: MerchantContextService,
  ) {}

  async quote(userId: string, input: CreateJobInput): Promise<Quote> {
    const merchant = await this.merchants.forUser(userId);
    return (await this.zones.quote(merchant.cityId, input.stops.map(toQuotedStop))).quote;
  }

  /**
   * Creates a job. The price is always recomputed here; the client never sends it.
   * With an idempotency key, repeating the request returns the first job instead of a new one.
   */
  async create(userId: string, input: CreateJobInput, idempotencyKey?: string) {
    const merchant = await this.merchants.activeForUser(userId);
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(merchant.id, idempotencyKey);
      if (existing) return { job: await this.detail(merchant.id, existing), created: false };
    }

    const { quote, zoneIds } = await this.zones.quote(merchant.cityId, input.stops.map(toQuotedStop));
    const status: JobStatus = input.scheduledFor ? 'SCHEDULED' : 'SEARCHING';

    try {
      const jobId = await this.db.transaction(async (tx) => {
        const [job] = await tx
          .insert(jobs)
          .values({
            cityId: merchant.cityId,
            merchantId: merchant.id,
            createdByUserId: userId,
            status,
            priceCents: quote.total,
            quote,
            scheduledFor: input.scheduledFor ?? null,
            notes: input.notes ?? null,
            trackingToken: newTrackingToken(),
            idempotencyKey: idempotencyKey ?? null,
          })
          .returning({ id: jobs.id });

        await tx.insert(stops).values(
          input.stops.map((s, position) => ({
            jobId: job!.id,
            position,
            kind: s.kind,
            address: s.address,
            location: { lng: s.location.lng, lat: s.location.lat },
            zoneId: zoneIds[position]!,
            contactName: s.contactName ?? null,
            contactPhone: s.contactPhone ?? null,
            instructions: s.instructions ?? null,
            cashToCollectCents: s.cashToCollect ?? null,
            maxSpendCents: s.maxSpend ?? null,
            deliveryCode: s.kind === 'DROPOFF' ? newDeliveryCode() : null,
          })),
        );

        await tx.insert(jobEvents).values({
          jobId: job!.id,
          actor: 'MERCHANT',
          actorUserId: userId,
          fromStatus: null,
          toStatus: status,
          metadata: { priceCents: quote.total },
        });
        return job!.id;
      });
      return { job: await this.detail(merchant.id, jobId), created: true };
    } catch (error) {
      // Two identical requests raced: the loser returns the winner's job.
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(merchant.id, idempotencyKey);
        if (existing) return { job: await this.detail(merchant.id, existing), created: false };
      }
      throw error;
    }
  }

  async list(userId: string, query: ListJobsQuery) {
    const merchant = await this.merchants.forUser(userId);
    const rows = await this.db
      .select({
        id: jobs.id,
        status: jobs.status,
        priceCents: jobs.priceCents,
        scheduledFor: jobs.scheduledFor,
        createdAt: jobs.createdAt,
        trackingToken: jobs.trackingToken,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.merchantId, merchant.id),
          query.status ? eq(jobs.status, query.status) : undefined,
          query.before ? lt(jobs.createdAt, query.before) : undefined,
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(query.limit);
    if (rows.length === 0) return { items: [], nextBefore: null };

    const stopRows = await this.db
      .select({ jobId: stops.jobId, kind: stops.kind, status: stops.status, address: stops.address })
      .from(stops)
      .where(
        inArray(
          stops.jobId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(stops.position));

    const items = rows.map((r) => {
      const own = stopRows.filter((s) => s.jobId === r.id);
      return {
        ...r,
        stopCount: own.length,
        destination: own.at(-1)?.address ?? null,
        stops: own.map(({ kind, status }) => ({ kind, status })),
      };
    });
    return { items, nextBefore: rows.length === query.limit ? rows.at(-1)!.createdAt : null };
  }

  async get(userId: string, jobId: string) {
    const merchant = await this.merchants.forUser(userId);
    return this.detail(merchant.id, jobId);
  }

  async cancel(userId: string, jobId: string, reason: string) {
    const merchant = await this.merchants.forUser(userId);
    await this.db.transaction(async (tx) => {
      await transitionJob(tx, {
        jobId,
        merchantId: merchant.id,
        to: 'CANCELLED',
        actor: 'MERCHANT',
        actorUserId: userId,
        set: { cancelledAt: new Date(), cancelReason: reason },
        metadata: { reason },
      });
      // A live offer must die with the job, or a courier could still accept it.
      await tx
        .update(offers)
        .set({ status: 'EXPIRED', respondedAt: new Date() })
        .where(and(eq(offers.jobId, jobId), eq(offers.status, 'PENDING')));
    });
    return this.detail(merchant.id, jobId);
  }

  async relaunch(userId: string, jobId: string) {
    const merchant = await this.merchants.activeForUser(userId);
    await this.db.transaction((tx) =>
      transitionJob(tx, { jobId, merchantId: merchant.id, to: 'SEARCHING', actor: 'MERCHANT', actorUserId: userId }),
    );
    return this.detail(merchant.id, jobId);
  }

  /** Public tracking data, or 404 for unknown or expired links. */
  async track(token: string): Promise<TrackingView> {
    const [job] = await this.db
      .select({
        id: jobs.id,
        status: jobs.status,
        merchantName: merchants.displayName,
        courierFullName: couriers.fullName,
        scheduledFor: jobs.scheduledFor,
        createdAt: jobs.createdAt,
        completedAt: jobs.completedAt,
        cancelledAt: jobs.cancelledAt,
      })
      .from(jobs)
      .innerJoin(merchants, eq(merchants.id, jobs.merchantId))
      .leftJoin(couriers, eq(couriers.id, jobs.courierId))
      .where(eq(jobs.trackingToken, token));
    if (!job) throw new NotFoundException('Seguimiento inexistente o vencido');

    const jobStops = await this.db
      .select({ kind: stops.kind, status: stops.status })
      .from(stops)
      .where(eq(stops.jobId, job.id))
      .orderBy(asc(stops.position));
    const view = toTrackingView({ ...job, stops: jobStops }, new Date());
    if (!view) throw new NotFoundException('Seguimiento inexistente o vencido');
    return view;
  }

  private async detail(merchantId: string, jobId: string) {
    const [job] = await this.db
      .select({
        id: jobs.id,
        status: jobs.status,
        priceCents: jobs.priceCents,
        quote: jobs.quote,
        scheduledFor: jobs.scheduledFor,
        notes: jobs.notes,
        trackingToken: jobs.trackingToken,
        courierName: couriers.fullName,
        cancelReason: jobs.cancelReason,
        completedAt: jobs.completedAt,
        cancelledAt: jobs.cancelledAt,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .leftJoin(couriers, eq(couriers.id, jobs.courierId))
      .where(and(eq(jobs.id, jobId), eq(jobs.merchantId, merchantId)));
    if (!job) throw new NotFoundException('Envío inexistente');

    const [jobStops, events] = await Promise.all([
      this.db.select(stopColumns).from(stops).where(eq(stops.jobId, jobId)).orderBy(asc(stops.position)),
      this.db
        .select({
          actor: jobEvents.actor,
          fromStatus: jobEvents.fromStatus,
          toStatus: jobEvents.toStatus,
          stopPosition: jobEvents.stopPosition,
          metadata: jobEvents.metadata,
          createdAt: jobEvents.createdAt,
        })
        .from(jobEvents)
        .where(eq(jobEvents.jobId, jobId))
        .orderBy(asc(jobEvents.id)),
    ]);
    return { ...job, stops: jobStops, events };
  }

  private async findByIdempotencyKey(merchantId: string, key: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.merchantId, merchantId), eq(jobs.idempotencyKey, key)));
    return row?.id ?? null;
  }
}

function toQuotedStop(s: CreateJobInput['stops'][number]) {
  return { kind: s.kind, location: { lng: s.location.lng, lat: s.location.lat } };
}
