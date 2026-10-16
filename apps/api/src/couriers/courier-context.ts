import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { couriers } from '../db/schema.js';

export interface CourierContext {
  id: string;
  cityId: string;
  kycStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
}

/** Resolves the courier profile of the logged-in user. */
@Injectable()
export class CourierContextService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async forUser(userId: string): Promise<CourierContext> {
    const [row] = await this.db
      .select({ id: couriers.id, cityId: couriers.cityId, kycStatus: couriers.kycStatus })
      .from(couriers)
      .where(eq(couriers.userId, userId));
    if (!row) throw new ForbiddenException('Tu usuario no es cadete');
    return row;
  }

  async approvedForUser(userId: string): Promise<CourierContext> {
    const courier = await this.forUser(userId);
    if (courier.kycStatus !== 'APPROVED') {
      throw new ForbiddenException(
        courier.kycStatus === 'PENDING' ? 'Tu cuenta todavía no fue aprobada' : 'Tu cuenta no está habilitada',
      );
    }
    return courier;
  }
}
