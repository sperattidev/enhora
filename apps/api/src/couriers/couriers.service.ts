import {
  allStopsFinished,
  assertStopTransition,
  InvalidTransitionError,
  type AdvanceStopInput,
  type CourierLocationInput,
} from '@enhora/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { couriers, jobEvents, jobs, merchants, offers, stops } from '../db/schema.js';
import { codesMatch, MAX_CODE_ATTEMPTS } from '../jobs/codes.js';
import { transitionJob } from '../jobs/transitions.js';
import { CourierContextService } from './courier-context.js';

const ACTIVE_JOB_STATUSES = ['ASSIGNED', 'IN_PROGRESS'] as const;
const CODE_MISMATCH = 'CODE_MISMATCH';

/** What a courier sees of a stop. Never the delivery code: the recipient dictates it. */
const courierStopColumns = {
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
};

@Injectable()
export class CouriersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly couriers: CourierContextService,
  ) {}

  async setAvailability(userId: string, online: boolean): Promise<{ online: boolean }> {
    const courier = online ? await this.couriers.approvedForUser(userId) : await this.couriers.forUser(userId);
    await this.db.transaction(async (tx) => {
      await tx.update(couriers).set({ online }).where(eq(couriers.id, courier.id));
      if (!online) {
        // Going offline gives back the pending offer right away instead of letting it time out.
        await tx
          .update(offers)
          .set({ status: 'EXPIRED', respondedAt: new Date() })
          .where(and(eq(offers.courierId, courier.id), eq(offers.status, 'PENDING')));
      }
    });
    return { online };
  }

  async updateLocation(userId: string, input: CourierLocationInput): Promise<void> {
    const courier = await this.couriers.forUser(userId);
    await this.db
      .update(couriers)
      .set({ lastLocation: { lng: input.lng, lat: input.lat }, lastSeenAt: new Date() })
      .where(eq(couriers.id, courier.id));
  }

  /** The live offer for this courier, or null. Couriers poll this until real-time push lands. */
  async currentOffer(userId: string) {
    const courier = await this.couriers.forUser(userId);
    const [offer] = await this.db
      .select({
        id: offers.id,
        expiresAt: offers.expiresAt,
        jobId: jobs.id,
        earningsCents: jobs.priceCents,
        merchantName: merchants.displayName,
      })
      .from(offers)
      .innerJoin(jobs, eq(jobs.id, offers.jobId))
      .innerJoin(merchants, eq(merchants.id, jobs.merchantId))
      .where(and(eq(offers.courierId, courier.id), eq(offers.status, 'PENDING'), gt(offers.expiresAt, new Date())));
    if (!offer) return null;

    // Enough to decide, without the recipient's personal data until the job is accepted.
    const offerStops = await this.db
      .select({
        kind: stops.kind,
        address: stops.address,
        location: stops.location,
        cashToCollectCents: stops.cashToCollectCents,
      })
      .from(stops)
      .where(eq(stops.jobId, offer.jobId))
      .orderBy(asc(stops.position));
    return { ...offer, stops: offerStops };
  }

  async acceptOffer(userId: string, offerId: string) {
    const courier = await this.couriers.approvedForUser(userId);
    const jobId = await this.db.transaction(async (tx) => {
      const [offer] = await tx
        .select({ jobId: offers.jobId })
        .from(offers)
        .where(
          and(
            eq(offers.id, offerId),
            eq(offers.courierId, courier.id),
            eq(offers.status, 'PENDING'),
            gt(offers.expiresAt, new Date()),
          ),
        )
        .for('update');
      if (!offer) throw new ConflictException('La oferta ya no está disponible');

      const now = new Date();
      await tx.update(offers).set({ status: 'ACCEPTED', respondedAt: now }).where(eq(offers.id, offerId));
      await transitionJob(tx, {
        jobId: offer.jobId,
        to: 'ASSIGNED',
        actor: 'SYSTEM',
        actorUserId: userId,
        set: { courierId: courier.id, assignedAt: now, searchingSince: null },
        metadata: { courierId: courier.id, offerId },
      });
      return offer.jobId;
    });
    return this.activeJob(courier.id, jobId);
  }

  async rejectOffer(userId: string, offerId: string): Promise<void> {
    const courier = await this.couriers.forUser(userId);
    const rows = await this.db
      .update(offers)
      .set({ status: 'REJECTED', respondedAt: new Date() })
      .where(and(eq(offers.id, offerId), eq(offers.courierId, courier.id), eq(offers.status, 'PENDING')))
      .returning({ id: offers.id });
    if (rows.length === 0) throw new NotFoundException('Oferta inexistente');
  }

  async activeJobs(userId: string) {
    const courier = await this.couriers.forUser(userId);
    const rows = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.courierId, courier.id), inArray(jobs.status, ACTIVE_JOB_STATUSES)))
      .orderBy(asc(jobs.assignedAt));
    return Promise.all(rows.map((r) => this.activeJob(courier.id, r.id)));
  }

  /** Gives an assigned job back before pickup; it goes back to searching without this courier. */
  async release(userId: string, jobId: string): Promise<void> {
    const courier = await this.couriers.forUser(userId);
    await this.db.transaction((tx) =>
      transitionJob(tx, {
        jobId,
        courierId: courier.id,
        to: 'SEARCHING',
        actor: 'COURIER',
        actorUserId: userId,
        set: { courierId: null, assignedAt: null, searchingSince: new Date() },
        metadata: { releasedBy: courier.id },
      }),
    );
  }

  async advanceStop(userId: string, jobId: string, position: number, input: AdvanceStopInput) {
    const courier = await this.couriers.forUser(userId);
    if (input.to === 'DONE') await this.verifyDeliveryCode(courier.id, userId, jobId, position, input.deliveryCode);

    await this.db.transaction(async (tx) => {
      const [job] = await tx
        .select({ status: jobs.status })
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.courierId, courier.id), inArray(jobs.status, ACTIVE_JOB_STATUSES)))
        .for('update');
      if (!job) throw new NotFoundException('Envío inexistente');

      const jobStops = await tx
        .select({ id: stops.id, kind: stops.kind, status: stops.status, cash: stops.cashToCollectCents })
        .from(stops)
        .where(eq(stops.jobId, jobId))
        .orderBy(asc(stops.position))
        .for('update');
      const stop = jobStops[position];
      try {
        assertStopTransition(jobStops, position, input.to, 'COURIER');
      } catch (error) {
        if (error instanceof InvalidTransitionError)
          throw new ConflictException('Esa parada no se puede avanzar ahora');
        throw error;
      }

      const now = new Date();
      await tx
        .update(stops)
        .set({
          status: input.to,
          ...(input.to === 'ARRIVED' ? { arrivedAt: now } : {}),
          ...(input.to === 'DONE' || input.to === 'FAILED' ? { finishedAt: now } : {}),
          ...(input.to === 'FAILED' ? { failureReason: input.failureReason } : {}),
        })
        .where(eq(stops.id, stop!.id));
      await tx.insert(jobEvents).values({
        jobId,
        actor: 'COURIER',
        actorUserId: userId,
        fromStatus: stop!.status,
        toStatus: input.to,
        stopPosition: position,
        metadata: input.to === 'FAILED' && input.note ? { note: input.note } : null,
      });

      // Cash collected stays with the courier until handed over to the merchant.
      if (input.to === 'DONE' && stop!.kind === 'DROPOFF' && stop!.cash) {
        await tx
          .update(couriers)
          .set({ cashInHandCents: sql`${couriers.cashInHandCents} + ${stop!.cash}` })
          .where(eq(couriers.id, courier.id));
      }

      const finished = input.to === 'DONE' || input.to === 'FAILED';
      if (finished && job.status === 'ASSIGNED') {
        await transitionJob(tx, { jobId, to: 'IN_PROGRESS', actor: 'COURIER', actorUserId: userId });
      }
      const updated = jobStops.map((s, i) => (i === position ? { status: input.to } : s));
      if (finished && allStopsFinished(updated)) {
        await transitionJob(tx, {
          jobId,
          to: 'COMPLETED',
          actor: 'SYSTEM',
          actorUserId: null,
          set: { completedAt: now },
        });
      }
    });
    return this.activeJob(courier.id, jobId);
  }

  /**
   * Deliveries are closed with the 4-digit code the recipient reads out. Wrong attempts are
   * recorded outside the main transaction so they survive the rejection, and the stop locks
   * after MAX_CODE_ATTEMPTS.
   */
  private async verifyDeliveryCode(
    courierId: string,
    userId: string,
    jobId: string,
    position: number,
    given: string | undefined,
  ): Promise<void> {
    const [stop] = await this.db
      .select({ kind: stops.kind, code: stops.deliveryCode })
      .from(stops)
      .innerJoin(jobs, eq(jobs.id, stops.jobId))
      .where(and(eq(stops.jobId, jobId), eq(stops.position, position), eq(jobs.courierId, courierId)));
    if (!stop || stop.kind !== 'DROPOFF' || !stop.code) return;

    const [attempts] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobEvents)
      .where(
        and(
          eq(jobEvents.jobId, jobId),
          eq(jobEvents.stopPosition, position),
          sql`${jobEvents.metadata}->>'type' = ${CODE_MISMATCH}`,
        ),
      );
    if ((attempts?.count ?? 0) >= MAX_CODE_ATTEMPTS) {
      throw new ConflictException('Demasiados intentos con el código. Comunicate con el comercio.');
    }
    if (!given) throw new ConflictException('Pedile al cliente el código de entrega');
    if (!codesMatch(stop.code, given)) {
      await this.db.insert(jobEvents).values({
        jobId,
        actor: 'COURIER',
        actorUserId: userId,
        fromStatus: null,
        toStatus: 'DONE',
        stopPosition: position,
        metadata: { type: CODE_MISMATCH },
      });
      throw new ConflictException('El código de entrega no coincide');
    }
  }

  private async activeJob(courierId: string, jobId: string) {
    const [job] = await this.db
      .select({
        id: jobs.id,
        status: jobs.status,
        earningsCents: jobs.priceCents,
        notes: jobs.notes,
        assignedAt: jobs.assignedAt,
        merchantName: merchants.displayName,
        merchantPhone: merchants.phone,
      })
      .from(jobs)
      .innerJoin(merchants, eq(merchants.id, jobs.merchantId))
      .where(and(eq(jobs.id, jobId), eq(jobs.courierId, courierId)));
    if (!job) throw new NotFoundException('Envío inexistente');
    const jobStops = await this.db
      .select(courierStopColumns)
      .from(stops)
      .where(eq(stops.jobId, jobId))
      .orderBy(asc(stops.position));
    return { ...job, stops: jobStops };
  }
}
