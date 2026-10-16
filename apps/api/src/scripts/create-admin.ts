/**
 * Creates the first administrator. Reads credentials from the environment so they never end up
 * in shell history:  ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @enhora/api admin:create
 */
import { emailSchema, passwordSchema } from '@enhora/shared';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hashPassword } from '../auth/password.js';
import { users } from '../db/schema.js';

const email = emailSchema.parse(process.env.ADMIN_EMAIL);
const password = passwordSchema.parse(process.env.ADMIN_PASSWORD);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const client = postgres(databaseUrl, { max: 1 });
try {
  const [created] = await drizzle(client)
    .insert(users)
    .values({ email, passwordHash: await hashPassword(password), role: 'ADMIN' })
    .onConflictDoNothing()
    .returning({ id: users.id });
  process.stdout.write(created ? `Admin created: ${created.id}\n` : `An account with that email already exists\n`);
} finally {
  await client.end();
}
