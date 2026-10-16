/**
 * Applies pending migrations from ./drizzle using only runtime dependencies, so the production
 * image does not need drizzle-kit. Runs once before every deploy: `node dist/scripts/migrate.js`.
 */
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

// dist/scripts/migrate.js → ../../drizzle
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder });
  process.stdout.write('Migrations applied\n');
} finally {
  await client.end();
}
