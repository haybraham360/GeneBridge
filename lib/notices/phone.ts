import 'server-only';
import { DEV_NOTICE_SALT, hashPhoneWith } from './phoneFormat';

/**
 * Relatives' phone numbers are used once, to send the message, and then
 * only kept as a salted hash (task 08 section 2). Normalised first so
 * "050 123 4567" and "+971501234567" hash the same, and "Stop them" works
 * whichever way the sender typed it.
 */
function salt(): string {
  const value = process.env.NOTICE_PHONE_SALT;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NOTICE_PHONE_SALT is not set. See .env.example.');
  }
  return DEV_NOTICE_SALT;
}

export function hashPhone(phone: string): string {
  return hashPhoneWith(salt(), phone);
}
