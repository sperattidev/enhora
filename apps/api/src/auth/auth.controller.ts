import {
  loginInputSchema,
  registerCourierInputSchema,
  registerMerchantInputSchema,
  type LoginInput,
  type RegisterCourierInput,
  type RegisterMerchantInput,
} from '@enhora/shared';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ENV, type Env } from '../config/env.js';
import { type AccountView, AuthRepository } from './auth.repository.js';
import { AuthService, type ClientInfo, type IssuedTokens } from './auth.service.js';
import { CurrentUser, Public } from './decorators.js';
import type { AccessClaims } from './tokens.js';

export const REFRESH_COOKIE = 'enhora_rt';
const REFRESH_COOKIE_PATH = '/auth';

/** Brute-force protection for credential endpoints: 5 attempts per minute per IP. */
const STRICT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly repo: AuthRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post('register/merchant')
  registerMerchant(@Body(new ZodValidationPipe(registerMerchantInputSchema)) body: RegisterMerchantInput) {
    return this.auth.registerMerchant(body);
  }

  @Public()
  @Throttle(STRICT)
  @Post('register/courier')
  registerCourier(@Body(new ZodValidationPipe(registerCourierInputSchema)) body: RegisterCourierInput) {
    return this.auth.registerCourier(body);
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginInputSchema)) body: LoginInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(await this.auth.login(body, clientInfo(req)), reply);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    this.assertTrustedOrigin(req);
    const token = req.cookies[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('Sesión inválida o vencida');
    try {
      return this.respond(await this.auth.refresh(token, clientInfo(req)), reply);
    } catch (error) {
      reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    this.assertTrustedOrigin(req);
    const token = req.cookies[REFRESH_COOKIE];
    if (token) await this.auth.logout(token);
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Get('me')
  async me(@CurrentUser() user: AccessClaims): Promise<AccountView> {
    const account = await this.repo.findAccount(user.userId);
    if (!account) throw new NotFoundException();
    return account;
  }

  /** The refresh token lives in an HttpOnly cookie; only the access token reaches JavaScript. */
  private respond(issued: IssuedTokens, reply: FastifyReply) {
    reply.setCookie(REFRESH_COOKIE, issued.refreshToken, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: issued.refreshExpiresAt,
    });
    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn, user: issued.user };
  }

  /** CSRF defense for cookie-authenticated endpoints: browsers always send Origin on POST. */
  private assertTrustedOrigin(req: FastifyRequest): void {
    const origin = req.headers.origin;
    if (origin && !this.env.CORS_ORIGINS.includes(origin)) throw new ForbiddenException('Origen no permitido');
  }
}

function clientInfo(req: FastifyRequest): ClientInfo {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}
