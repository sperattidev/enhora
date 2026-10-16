import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ENV, type Env } from './env.js';

/** Exposes the already validated environment. Parsing happens once, in the entrypoint. */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: ENV, useValue: env }], exports: [ENV] };
  }
}
