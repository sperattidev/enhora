import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://u:secret@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(base)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      CORS_ORIGINS: [],
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
    });
  });

  it('splits CORS origins', () => {
    const env = loadEnv({ ...base, CORS_ORIGINS: 'https://app.enhora.net.ar, https://cadete.enhora.net.ar' });
    expect(env.CORS_ORIGINS).toEqual(['https://app.enhora.net.ar', 'https://cadete.enhora.net.ar']);
  });

  it('rejects a non-postgres database url', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a weak JWT secret', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'corto' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('never leaks secret values in the error', () => {
    const run = () => loadEnv({ ...base, DATABASE_URL: 'mysql://user:secret@localhost/db' });
    expect(run).toThrow(/DATABASE_URL/);
    expect(run).not.toThrow(/secret/);
  });
});
