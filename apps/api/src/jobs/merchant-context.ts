import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { merchantMembers, merchants } from '../db/schema.js';

export interface MerchantContext {
  id: string;
  cityId: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  displayName: string;
}

/** Resolves which merchant the logged-in user acts for. */
@Injectable()
export class MerchantContextService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async forUser(userId: string): Promise<MerchantContext> {
    const [row] = await this.db
      .select({
        id: merchants.id,
        cityId: merchants.cityId,
        status: merchants.status,
        displayName: merchants.displayName,
      })
      .from(merchantMembers)
      .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
      .where(eq(merchantMembers.userId, userId))
      .limit(1);
    if (!row) throw new ForbiddenException('Tu usuario no pertenece a ningún comercio');
    return row;
  }

  async activeForUser(userId: string): Promise<MerchantContext> {
    const merchant = await this.forUser(userId);
    if (merchant.status !== 'ACTIVE') {
      throw new ForbiddenException(
        merchant.status === 'PENDING' ? 'Tu comercio todavía no fue aprobado' : 'Tu comercio está suspendido',
      );
    }
    return merchant;
  }
}
