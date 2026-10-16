import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { couriers, merchants, sessions, users } from '../db/schema.js';

type KycStatus = (typeof couriers.$inferSelect)['kycStatus'];
type MerchantStatus = (typeof merchants.$inferSelect)['status'];
type UserStatus = (typeof users.$inferSelect)['status'];

@Injectable()
export class AdminService {
  constructor(@Inject(DB) private readonly db: Database) {}

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
