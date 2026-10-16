import {
  createZoneInputSchema,
  pricingRulesInputSchema,
  updateZoneInputSchema,
  type CreateZoneInput,
  type PricingRulesInput,
  type UpdateZoneInput,
} from '@enhora/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ZonesService } from './zones.service.js';

@Roles('ADMIN')
@Controller('admin')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Post('zones')
  create(@Body(new ZodValidationPipe(createZoneInputSchema)) body: CreateZoneInput) {
    return this.zones.create(body);
  }

  @Get('cities/:slug/zones')
  list(@Param('slug') slug: string) {
    return this.zones.list(slug);
  }

  @Patch('zones/:id')
  @HttpCode(204)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateZoneInputSchema)) body: UpdateZoneInput,
  ): Promise<void> {
    return this.zones.update(id, body);
  }

  @Get('cities/:slug/pricing')
  getPricing(@Param('slug') slug: string) {
    return this.zones.getPricing(slug);
  }

  @Put('cities/:slug/pricing')
  @HttpCode(204)
  setPricing(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(pricingRulesInputSchema)) body: PricingRulesInput,
  ): Promise<void> {
    return this.zones.setPricing(slug, body);
  }
}
