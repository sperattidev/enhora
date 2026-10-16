import { hash, verify } from '@node-rs/argon2';

// `Algorithm` is an ambient const enum that isolatedModules cannot read; 2 is Algorithm.Argon2id.
const ARGON2ID = 2;

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations).
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When the account does not exist, pass `null` and a dummy hash is verified
 * instead, so response time does not reveal which emails are registered.
 */
export async function verifyPassword(storedHash: string | null, password: string): Promise<boolean> {
  if (storedHash === null) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    await verify(await dummyHash, password);
    return false;
  }
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
