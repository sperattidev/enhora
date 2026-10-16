import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
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

@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('couriers')
  listCouriers(@Query(new ZodValidationPipe(courierListQuery)) query: z.infer<typeof courierListQuery>) {
    return this.admin.listCouriers(query.kycStatus);
  }

  @Patch('couriers/:id/kyc')
  @HttpCode(204)
  async decideCourier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(kycDecision)) body: z.infer<typeof kycDecision>,
  ): Promise<void> {
    if (!(await this.admin.setCourierKyc(id, body.kycStatus))) throw new NotFoundException();
  }

  @Get('merchants')
  listMerchants(@Query(new ZodValidationPipe(merchantListQuery)) query: z.infer<typeof merchantListQuery>) {
    return this.admin.listMerchants(query.status);
  }

  @Patch('merchants/:id/status')
  @HttpCode(204)
  async decideMerchant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(merchantDecision)) body: z.infer<typeof merchantDecision>,
  ): Promise<void> {
    if (!(await this.admin.setMerchantStatus(id, body.status))) throw new NotFoundException();
  }

  @Patch('users/:id/status')
  @HttpCode(204)
  async setUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userDecision)) body: z.infer<typeof userDecision>,
  ): Promise<void> {
    if (!(await this.admin.setUserStatus(id, body.status))) throw new NotFoundException();
  }
}
