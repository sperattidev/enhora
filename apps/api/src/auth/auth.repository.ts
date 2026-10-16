import type { RegisterCourierInput, RegisterMerchantInput, Role } from '@enhora/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import { DB, type Database } from '../db/db.module.js';
import { cities, couriers, merchantMembers, merchants, sessions, users } from '../db/schema.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewSession {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
}

export interface AccountView {
  id: string;
  email: string;
  role: Role;
  merchant: { id: string; displayName: string; status: string } | null;
  courier: { id: string; fullName: string; kycStatus: string } | null;
}

/** Raised when an email, CUIT or DNI is already registered. */
export class DuplicateAccountError extends Error {
  constructor() {
    super('Account already exists');
    this.name = 'DuplicateAccountError';
  }
}

/** Persistence port for authentication, so the service can be tested without a database. */
export abstract class AuthRepository {
  abstract findUserByEmail(email: string): Promise<UserRecord | null>;
  abstract findUserById(id: string): Promise<UserRecord | null>;
  abstract findAccount(userId: string): Promise<AccountView | null>;
  abstract findActiveCityId(slug: string): Promise<string | null>;
  abstract createMerchantAccount(input: RegisterMerchantInput, cityId: string, passwordHash: string): Promise<string>;
  abstract createCourierAccount(input: RegisterCourierInput, cityId: string, passwordHash: string): Promise<string>;
  abstract recordLogin(userId: string): Promise<void>;
  abstract createSession(session: NewSession): Promise<void>;
  /** Atomically revokes the session if it is still active. Returns null when it was not active. */
  abstract consumeSession(tokenHash: string, now: Date): Promise<SessionRecord | null>;
  abstract findSession(tokenHash: string): Promise<SessionRecord | null>;
  abstract revokeFamily(familyId: string, now: Date): Promise<void>;
}

const userColumns = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  role: users.role,
  status: users.status,
};

const sessionColumns = {
  id: sessions.id,
  userId: sessions.userId,
  familyId: sessions.familyId,
  expiresAt: sessions.expiresAt,
  revokedAt: sessions.revokedAt,
};

@Injectable()
export class DrizzleAuthRepository extends AuthRepository {
  constructor(@Inject(DB) private readonly db: Database) {
    super();
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select(userColumns)
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
    return row ?? null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db.select(userColumns).from(users).where(eq(users.id, id));
    return row ?? null;
  }

  async findAccount(userId: string): Promise<AccountView | null> {
    const user = await this.findUserById(userId);
    if (!user) return null;
    const [merchant] = await this.db
      .select({ id: merchants.id, displayName: merchants.displayName, status: merchants.status })
      .from(merchantMembers)
      .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
      .where(eq(merchantMembers.userId, userId))
      .limit(1);
    const [courier] = await this.db
      .select({ id: couriers.id, fullName: couriers.fullName, kycStatus: couriers.kycStatus })
      .from(couriers)
      .where(eq(couriers.userId, userId));
    return { id: user.id, email: user.email, role: user.role, merchant: merchant ?? null, courier: courier ?? null };
  }

  async findActiveCityId(slug: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: cities.id })
      .from(cities)
      .where(and(eq(cities.slug, slug), eq(cities.active, true)));
    return row?.id ?? null;
  }

  async createMerchantAccount(input: RegisterMerchantInput, cityId: string, passwordHash: string): Promise<string> {
    return this.uniqueOrDuplicate(() =>
      this.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: input.email, phone: input.phone, passwordHash, role: 'MERCHANT' })
          .returning({ id: users.id });
        const [merchant] = await tx
          .insert(merchants)
          .values({
            cityId,
            legalName: input.legalName,
            displayName: input.displayName,
            cuit: input.cuit,
            phone: input.phone,
            address: input.address,
            location: input.location,
          })
          .returning({ id: merchants.id });
        await tx.insert(merchantMembers).values({ merchantId: merchant!.id, userId: user!.id, role: 'OWNER' });
        return user!.id;
      }),
    );
  }

  async createCourierAccount(input: RegisterCourierInput, cityId: string, passwordHash: string): Promise<string> {
    return this.uniqueOrDuplicate(() =>
      this.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: input.email, phone: input.phone, passwordHash, role: 'COURIER' })
          .returning({ id: users.id });
        await tx.insert(couriers).values({
          userId: user!.id,
          cityId,
          fullName: input.fullName,
          dni: input.dni,
          vehicle: input.vehicle,
        });
        return user!.id;
      }),
    );
  }

  async recordLogin(userId: string): Promise<void> {
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  }

  async createSession(session: NewSession): Promise<void> {
    await this.db.insert(sessions).values(session);
  }

  async consumeSession(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    const [row] = await this.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .returning(sessionColumns);
    return row ?? null;
  }

  async findSession(tokenHash: string): Promise<SessionRecord | null> {
    const [row] = await this.db.select(sessionColumns).from(sessions).where(eq(sessions.tokenHash, tokenHash));
    return row ?? null;
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
  }

  private async uniqueOrDuplicate<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateAccountError();
      throw error;
    }
  }
}
