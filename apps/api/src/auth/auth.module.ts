import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { ClientIpThrottlerGuard } from './client-ip-throttler.guard.js';
import { AuthGuard } from './auth.guard.js';
import { AuthRepository, DrizzleAuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './tokens.js';

@Module({
  // In-memory counters are fine for one API instance; move to Redis storage before scaling out.
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    { provide: AuthRepository, useClass: DrizzleAuthRepository },
    // Guards run in registration order: rate limit first, then authentication.
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthRepository],
})
export class AuthModule {}
