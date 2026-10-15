import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = { DATABASE_URL: 'postgres://u:secret@localhost:5432/db' };

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(base)).toMatchObject({ NODE_ENV: 'development', PORT: 3000, CORS_ORIGINS: [] });
  });

  it('splits CORS origins', () => {
    const env = loadEnv({ ...base, CORS_ORIGINS: 'https://app.enhora.net.ar, https://cadete.enhora.net.ar' });
    expect(env.CORS_ORIGINS).toEqual(['https://app.enhora.net.ar', 'https://cadete.enhora.net.ar']);
  });

  it('rejects a non-postgres database url', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('never leaks secret values in the error', () => {
    const run = () => loadEnv({ DATABASE_URL: 'mysql://user:secret@localhost/db' });
    expect(run).toThrow(/DATABASE_URL/);
    expect(run).not.toThrow(/secret/);
  });
});
