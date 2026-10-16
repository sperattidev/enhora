import {
  advanceStopInputSchema,
  courierAvailabilityInputSchema,
  courierLocationInputSchema,
  type AdvanceStopInput,
  type CourierAvailabilityInput,
  type CourierLocationInput,
} from '@enhora/shared';
import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/tokens.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CouriersService } from './couriers.service.js';

@Roles('COURIER')
@Controller('courier')
export class CouriersController {
  constructor(private readonly couriers: CouriersService) {}

  @Put('availability')
  setAvailability(
    @CurrentUser() user: AccessClaims,
    @Body(new ZodValidationPipe(courierAvailabilityInputSchema)) body: CourierAvailabilityInput,
  ) {
    return this.couriers.setAvailability(user.userId, body.online);
  }

  /** Sent by the app every few seconds while online. */
  @Put('location')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  updateLocation(
    @CurrentUser() user: AccessClaims,
    @Body(new ZodValidationPipe(courierLocationInputSchema)) body: CourierLocationInput,
  ): Promise<void> {
    return this.couriers.updateLocation(user.userId, body);
  }

  @Get('offer')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  currentOffer(@CurrentUser() user: AccessClaims) {
    return this.couriers.currentOffer(user.userId);
  }

  @Post('offers/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.couriers.acceptOffer(user.userId, id);
  }

  @Post('offers/:id/reject')
  @HttpCode(204)
  reject(@CurrentUser() user: AccessClaims, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.couriers.rejectOffer(user.userId, id);
  }

  @Get('jobs')
  activeJobs(@CurrentUser() user: AccessClaims) {
    return this.couriers.activeJobs(user.userId);
  }

  @Post('jobs/:id/release')
  @HttpCode(204)
  release(@CurrentUser() user: AccessClaims, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.couriers.release(user.userId, id);
  }

  /** Brute-forcing a 4-digit code is also capped per stop; this limit protects the endpoint itself. */
  @Post('jobs/:id/stops/:position/advance')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  advance(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('position', ParseIntPipe) position: number,
    @Body(new ZodValidationPipe(advanceStopInputSchema)) body: AdvanceStopInput,
  ) {
    return this.couriers.advanceStop(user.userId, id, position, body);
  }
}
