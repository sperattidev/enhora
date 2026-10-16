import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { desc, eq, lt } from 'drizzle-orm';
import type { AuthenticatedRequest } from '../auth/decorators.js';
import { DB, type Database } from '../db/db.module.js';
import { adminAudit, users } from '../db/schema.js';

export interface AuditActor {
  userId: string;
  ip: string | null;
}

/** Who is acting and from where, for audit records. Only valid on authenticated routes. */
export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuditActor => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.auth) throw new Error('Actor used on a public route');
  return { userId: req.auth.userId, ip: req.ip ?? null };
});

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(actor: AuditActor, entry: AuditEntry): Promise<void> {
    await this.db.insert(adminAudit).values({
      adminUserId: actor.userId,
      ip: actor.ip,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      details: entry.details ?? null,
    });
  }

  list(limit: number, before?: number) {
    return this.db
      .select({
        id: adminAudit.id,
        action: adminAudit.action,
        targetType: adminAudit.targetType,
        targetId: adminAudit.targetId,
        details: adminAudit.details,
        adminEmail: users.email,
        createdAt: adminAudit.createdAt,
      })
      .from(adminAudit)
      .innerJoin(users, eq(users.id, adminAudit.adminUserId))
      .where(before ? lt(adminAudit.id, before) : undefined)
      .orderBy(desc(adminAudit.id))
      .limit(limit);
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
