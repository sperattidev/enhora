import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  /** Runs the in-process dispatcher loop. Tests turn it off and call `tick()` themselves. */
  DISPATCH_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  DISPATCH_INTERVAL_MS: z.coerce.number().int().min(500).max(60_000).default(2_000),
  OFFER_TTL_SECONDS: z.coerce.number().int().min(10).max(300).default(30),
  /** Give up searching after this long without anyone accepting. */
  SEARCH_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
  /** Scheduled jobs start searching this long before their time. */
  SCHEDULE_LEAD_MINUTES: z.coerce.number().int().min(0).max(120).default(15),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(10).default(2),
  MAX_OFFER_DISTANCE_METERS: z.coerce.number().int().min(100).max(100_000).default(5_000),
  COURIER_CASH_LIMIT_CENTS: z.coerce.number().int().min(0).default(5_000_000),
  /** A courier whose last location is older than this is treated as offline. */
  COURIER_STALE_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

/** Parses the environment and fails fast with every problem listed, never echoing values. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
