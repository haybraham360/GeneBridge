import 'server-only';
/**
 * Verification documents are encrypted by the server before they reach
 * storage (guardrail 16), on top of Supabase's encryption at rest. AES-256-GCM
 * with a random 12-byte IV per file; the stored blob is
 *   "GBK1" | iv (12) | tag (16) | ciphertext
 * The key never leaves the server. Set KYC_ENCRYPTION_KEY to 32 random bytes,
 * base64 (`openssl rand -base64 32`). Keep it once documents exist: files
 * encrypted with a lost key can't be reviewed (they would have to be
 * resubmitted).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('GBK1');
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cached: Buffer | null = null;

export class KycKeyMissingError extends Error {
  constructor() {
    super('KYC_ENCRYPTION_KEY is not set');
  }
}

function key(): Buffer {
  if (cached) return cached;
  const raw = process.env.KYC_ENCRYPTION_KEY;
  if (raw) {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length !== 32) throw new Error('KYC_ENCRYPTION_KEY must be 32 bytes, base64');
    cached = decoded;
    return cached;
  }
  // Local development only: derive a stable key from the service role key so
  // the flow works without extra setup. Production refuses to run without a
  // dedicated key.
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NODE_ENV === 'production' || !fallback) throw new KycKeyMissingError();
  console.warn('KYC_ENCRYPTION_KEY is not set: using a development key. Set it before going live.');
  cached = Buffer.from(hkdfSync('sha256', fallback, 'genebridge', 'kyc-documents-dev', 32));
  return cached;
}

export function kycEncryptionAvailable(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptDocument(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decryptDocument(blob: Buffer): Buffer {
  if (blob.length < MAGIC.length + IV_BYTES + TAG_BYTES || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Not an encrypted document');
  }
  const iv = blob.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = blob.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]);
}
