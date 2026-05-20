import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Staff PIN hashing. We never store the raw PIN — only a salted scrypt hash.
 *
 * Format: `scrypt$<saltHex>$<derivedKeyHex>`. Self-describing so we can rotate
 * the algorithm later without a migration. scrypt is deliberately slow/memory
 * hard, which is appropriate for a low-entropy 4–8 digit secret.
 */

const KEYLEN = 32;
const SALT_BYTES = 16;

export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(pin, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  const derived = scryptSync(pin, salt, expected.length);
  // Constant-time compare to avoid leaking match progress via timing.
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
