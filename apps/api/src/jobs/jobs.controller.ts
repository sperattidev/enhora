import {
  cancelJobInputSchema,
  createJobInputSchema,
  idempotencyKeySchema,
  listJobsQuerySchema,
  type CancelJobInput,
  type CreateJobInput,
  type ListJobsQuery,
} from '@enhora/shared';
import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/tokens.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { JobsService } from './jobs.service.js';

@Roles('MERCHANT')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /** Price preview: same rules as creation, nothing is stored. */
  @Post('quote')
  @HttpCode(200)
  quote(@CurrentUser() user: AccessClaims, @Body(new ZodValidationPipe(createJobInputSchema)) body: CreateJobInput) {
    return this.jobs.quote(user.userId, body);
  }

  /** 201 for a new job; 200 when the Idempotency-Key matched an earlier request. */
  @Post()
  async create(
    @CurrentUser() user: AccessClaims,
    @Body(new ZodValidationPipe(createJobInputSchema)) body: CreateJobInput,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const key = new ZodValidationPipe(idempotencyKeySchema.optional()).transform(rawKey);
    const { job, created } = await this.jobs.create(user.userId, body, key);
    reply.status(created ? 201 : 200);
    return job;
  }

  @Get()
  list(@CurrentUser() user: AccessClaims, @Query(new ZodValidationPipe(listJobsQuerySchema)) query: ListJobsQuery) {
    return this.jobs.list(user.userId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(user.userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelJobInputSchema)) body: CancelJobInput,
  ) {
    return this.jobs.cancel(user.userId, id, body.reason);
  }

  @Post(':id/relaunch')
  @HttpCode(200)
  relaunch(@CurrentUser() user: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.relaunch(user.userId, id);
  }
}
