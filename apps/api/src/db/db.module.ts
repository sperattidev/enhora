import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV, type Env } from '../config/env.js';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export const DB = Symbol('DB');
const SQL_CLIENT = Symbol('SQL_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: SQL_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => postgres(env.DATABASE_URL, { max: 10, idle_timeout: 30 }),
    },
    {
      provide: DB,
      inject: [SQL_CLIENT],
      useFactory: (client: postgres.Sql) => drizzle(client, { schema }),
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(SQL_CLIENT) private readonly client: postgres.Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
