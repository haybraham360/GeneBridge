import 'server-only';
/**
 * Google refresh tokens are encrypted before they are stored (task 15,
 * section 5): AES-256-GCM with a random IV, stored as base64 of
 *   "GBC1" | iv (12) | tag (16) | ciphertext
 * Set CALENDAR_TOKEN_KEY to 32 random bytes, base64 (`openssl rand -base64 32`).
 * It is separate from the verification-document key, so one leaked key
 * never exposes both. Losing it only means professionals reconnect Google.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('GBC1');
let cached: Buffer | null = null;

function key(): Buffer {
  if (cached) return cached;
  const raw = process.env.CALENDAR_TOKEN_KEY;
  if (raw) {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length !== 32) throw new Error('CALENDAR_TOKEN_KEY must be 32 bytes, base64');
    return (cached = decoded);
  }
  // Development only, like KYC_ENCRYPTION_KEY: production needs its own key.
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NODE_ENV === 'production' || !fallback) throw new Error('CALENDAR_TOKEN_KEY is not set');
  return (cached = Buffer.from(hkdfSync('sha256', fallback, 'genebridge', 'calendar-tokens-dev', 32)));
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]).toString('base64');
}

export function decryptToken(stored: string): string {
  const blob = Buffer.from(stored, 'base64');
  if (blob.length < 33 || !blob.subarray(0, 4).equals(MAGIC)) throw new Error('Not an encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', key(), blob.subarray(4, 16));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(blob.subarray(16, 32));
  return Buffer.concat([decipher.update(blob.subarray(32)), decipher.final()]).toString('utf8');
}
