import {
  createZoneInputSchema,
  pricingRulesInputSchema,
  updateZoneInputSchema,
  type CreateZoneInput,
  type PricingRulesInput,
  type UpdateZoneInput,
} from '@enhora/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Actor, AuditService, type AuditActor } from '../audit/audit.service.js';
import { Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ZonesService } from './zones.service.js';

@Roles('ADMIN')
@Controller('admin')
export class ZonesController {
  constructor(
    private readonly zones: ZonesService,
    private readonly audit: AuditService,
  ) {}

  @Post('zones')
  async create(@Actor() actor: AuditActor, @Body(new ZodValidationPipe(createZoneInputSchema)) body: CreateZoneInput) {
    const zone = await this.zones.create(body);
    // The polygon itself is not copied into the log: it lives on the zone and can be large.
    await this.audit.record(actor, {
      action: 'zone.create',
      targetType: 'zone',
      targetId: zone.id,
      details: { citySlug: body.citySlug, name: body.name, feeCents: body.feeCents },
    });
    return zone;
  }

  @Get('cities/:slug/zones')
  list(@Param('slug') slug: string) {
    return this.zones.list(slug);
  }

  @Patch('zones/:id')
  @HttpCode(204)
  async update(
    @Actor() actor: AuditActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateZoneInputSchema)) body: UpdateZoneInput,
  ): Promise<void> {
    await this.zones.update(id, body);
    await this.audit.record(actor, { action: 'zone.update', targetType: 'zone', targetId: id, details: body });
  }

  @Get('cities/:slug/pricing')
  getPricing(@Param('slug') slug: string) {
    return this.zones.getPricing(slug);
  }

  @Put('cities/:slug/pricing')
  @HttpCode(204)
  async setPricing(
    @Actor() actor: AuditActor,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(pricingRulesInputSchema)) body: PricingRulesInput,
  ): Promise<void> {
    await this.zones.setPricing(slug, body);
    await this.audit.record(actor, { action: 'pricing.update', targetType: 'city', targetId: slug, details: body });
  }
}
