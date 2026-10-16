import { ACTORS, JOB_STATUSES, ROLES, STOP_FAILURE_REASONS, STOP_KINDS, STOP_STATUSES, VEHICLES } from '@enhora/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { multiPolygon, point } from './geo.js';

const cents = (name: string) => bigint(name, { mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const userRole = pgEnum('user_role', ROLES);
export const userStatus = pgEnum('user_status', ['ACTIVE', 'SUSPENDED']);
export const merchantStatus = pgEnum('merchant_status', ['PENDING', 'ACTIVE', 'SUSPENDED']);
export const merchantMemberRole = pgEnum('merchant_member_role', ['OWNER', 'STAFF']);
export const kycStatus = pgEnum('kyc_status', ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']);
export const vehicleType = pgEnum('vehicle_type', VEHICLES);
export const jobStatus = pgEnum('job_status', JOB_STATUSES);
export const stopKind = pgEnum('stop_kind', STOP_KINDS);
export const stopStatus = pgEnum('stop_status', STOP_STATUSES);
export const stopFailureReason = pgEnum('stop_failure_reason', STOP_FAILURE_REASONS);
export const actor = pgEnum('actor', ACTORS);
/** WITHDRAWN: the job was cancelled while the offer was live; it never counts against the courier. */
export const offerStatus = pgEnum('offer_status', ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN']);

export const cities = pgTable('cities', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  province: text('province').notNull(),
  timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
  active: boolean('active').notNull().default(false),
  createdAt: createdAt(),
});

/** Pricing knobs per city. Zone fees live on each zone; everything else is here. */
export const pricingRules = pgTable('pricing_rules', {
  cityId: uuid('city_id')
    .primaryKey()
    .references(() => cities.id),
  extraStopFeeCents: cents('extra_stop_fee_cents').notNull(),
  errandFeeCents: cents('errand_fee_cents').notNull(),
  surchargeBps: integer('surcharge_bps').notNull().default(0),
  roundToCents: integer('round_to_cents').notNull().default(0),
  freeWaitMinutes: integer('free_wait_minutes').notNull(),
  waitFeePerMinuteCents: cents('wait_fee_per_minute_cents').notNull(),
  updatedAt: updatedAt(),
});

export const zones = pgTable(
  'zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    name: text('name').notNull(),
    feeCents: cents('fee_cents').notNull(),
    area: multiPolygon('area').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('zones_area_gist').using('gist', t.area), index('zones_city_idx').on(t.cityId)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    phone: text('phone'),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull(),
    status: userStatus('status').notNull().default('ACTIVE'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)],
);

/**
 * One row per issued refresh token. Rotation revokes the row and issues a new one in the same family;
 * presenting a revoked token again means it was stolen, so the whole family is revoked.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    /** SHA-256 of the refresh token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_family_idx').on(t.familyId), index('sessions_user_idx').on(t.userId)],
);

export const merchants = pgTable(
  'merchants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    legalName: text('legal_name').notNull(),
    displayName: text('display_name').notNull(),
    cuit: text('cuit').notNull().unique(),
    phone: text('phone').notNull(),
    address: text('address').notNull(),
    location: point('location').notNull(),
    status: merchantStatus('status').notNull().default('PENDING'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('merchants_city_idx').on(t.cityId)],
);

export const merchantMembers = pgTable(
  'merchant_members',
  {
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: merchantMemberRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.userId] })],
);

export const couriers = pgTable(
  'couriers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    fullName: text('full_name').notNull(),
    dni: text('dni').notNull().unique(),
    vehicle: vehicleType('vehicle').notNull(),
    kycStatus: kycStatus('kyc_status').notNull().default('PENDING'),
    online: boolean('online').notNull().default(false),
    lastLocation: point('last_location'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    cashInHandCents: cents('cash_in_hand_cents').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('couriers_dispatch_idx').on(t.cityId, t.kycStatus, t.online),
    index('couriers_location_gist').using('gist', t.lastLocation),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    courierId: uuid('courier_id').references(() => couriers.id),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    status: jobStatus('status').notNull(),
    priceCents: cents('price_cents').notNull(),
    /** Price breakdown frozen at creation time. */
    quote: jsonb('quote').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    notes: text('notes'),
    /** Random, unguessable token for the public tracking page. */
    trackingToken: text('tracking_token').notNull().unique(),
    /** Client-supplied key so a double tap or a retried request never creates two jobs. */
    idempotencyKey: text('idempotency_key'),
    cancelReason: text('cancel_reason'),
    /** When the current search for a courier started; drives the search timeout. */
    searchingSince: timestamp('searching_since', { withTimezone: true }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('jobs_merchant_created_idx').on(t.merchantId, t.createdAt),
    index('jobs_courier_status_idx').on(t.courierId, t.status),
    index('jobs_city_status_idx').on(t.cityId, t.status),
    uniqueIndex('jobs_merchant_idempotency_uq')
      .on(t.merchantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

export const stops = pgTable(
  'stops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    kind: stopKind('kind').notNull(),
    status: stopStatus('status').notNull().default('PENDING'),
    address: text('address').notNull(),
    location: point('location').notNull(),
    zoneId: uuid('zone_id').references(() => zones.id),
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    instructions: text('instructions'),
    cashToCollectCents: cents('cash_to_collect_cents'),
    maxSpendCents: cents('max_spend_cents'),
    /** 4-digit code the recipient reads to the courier as proof of delivery. */
    deliveryCode: text('delivery_code'),
    proofPhotoKey: text('proof_photo_key'),
    failureReason: stopFailureReason('failure_reason'),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('stops_job_position_uq').on(t.jobId, t.position)],
);

/** Append-only audit log of every job and stop transition. */
export const jobEvents = pgTable(
  'job_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    actor: actor('actor').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    stopPosition: smallint('stop_position'),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (t) => [index('job_events_job_idx').on(t.jobId, t.createdAt)],
);

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    courierId: uuid('courier_id')
      .notNull()
      .references(() => couriers.id),
    status: offerStatus('status').notNull().default('PENDING'),
    offeredAt: timestamp('offered_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    // At most one live offer per job: assignment is strictly sequential.
    uniqueIndex('offers_one_pending_per_job_uq')
      .on(t.jobId)
      .where(sql`${t.status} = 'PENDING'`),
    index('offers_courier_idx').on(t.courierId, t.status),
  ],
);

/** Append-only record of every change an administrator makes. */
export const adminAudit = pgTable(
  'admin_audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('admin_audit_created_idx').on(t.createdAt),
    index('admin_audit_target_idx').on(t.targetType, t.targetId),
  ],
);
