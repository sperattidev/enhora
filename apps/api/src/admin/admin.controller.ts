import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { Actor, AuditService, type AuditActor } from '../audit/audit.service.js';
import { Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminService } from './admin.service.js';

const courierListQuery = z.object({
  kycStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).default('PENDING'),
});
const kycDecision = z.object({ kycStatus: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']) });
const merchantListQuery = z.object({ status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).default('PENDING') });
const merchantDecision = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });
const userDecision = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });
const jobsQuery = z.object({
  scope: z.enum(['active', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const auditQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  /** Numbers for the operations dashboard. */
  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('jobs')
  jobs(@Query(new ZodValidationPipe(jobsQuery)) query: z.infer<typeof jobsQuery>) {
    return this.admin.listJobs(query.scope, query.limit);
  }

  @Get('audit')
  auditLog(@Query(new ZodValidationPipe(auditQuery)) query: z.infer<typeof auditQuery>) {
    return this.audit.list(query.limit, query.before);
  }

  @Get('couriers')
  listCouriers(@Query(new ZodValidationPipe(courierListQuery)) query: z.infer<typeof courierListQuery>) {
    return this.admin.listCouriers(query.kycStatus);
  }

  @Patch('couriers/:id/kyc')
  @HttpCode(204)
  async decideCourier(
    @Actor() actor: AuditActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(kycDecision)) body: z.infer<typeof kycDecision>,
  ): Promise<void> {
    if (!(await this.admin.setCourierKyc(id, body.kycStatus))) throw new NotFoundException();
    await this.audit.record(actor, { action: 'courier.kyc', targetType: 'courier', targetId: id, details: body });
  }

  @Get('merchants')
  listMerchants(@Query(new ZodValidationPipe(merchantListQuery)) query: z.infer<typeof merchantListQuery>) {
    return this.admin.listMerchants(query.status);
  }

  @Patch('merchants/:id/status')
  @HttpCode(204)
  async decideMerchant(
    @Actor() actor: AuditActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(merchantDecision)) body: z.infer<typeof merchantDecision>,
  ): Promise<void> {
    if (!(await this.admin.setMerchantStatus(id, body.status))) throw new NotFoundException();
    await this.audit.record(actor, { action: 'merchant.status', targetType: 'merchant', targetId: id, details: body });
  }

  @Patch('users/:id/status')
  @HttpCode(204)
  async setUserStatus(
    @Actor() actor: AuditActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userDecision)) body: z.infer<typeof userDecision>,
  ): Promise<void> {
    if (!(await this.admin.setUserStatus(id, body.status))) throw new NotFoundException();
    await this.audit.record(actor, { action: 'user.status', targetType: 'user', targetId: id, details: body });
  }
}
