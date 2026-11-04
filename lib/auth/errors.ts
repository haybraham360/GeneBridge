/**
 * Maps Supabase auth errors to calm, plain messages (keys in auth.json →
 * errors). Messages never say whether a number or email has an account.
 */
export type AuthErrorKey =
  'codeInvalid' | 'tooMany' | 'sendFailed' | 'emailFailed' | 'linkInvalid' | 'generic';

type MaybeAuthError = { status?: number; code?: string; message?: string } | null | undefined;

export function isRateLimited(error: MaybeAuthError): boolean {
  if (!error) return false;
  return (
    error.status === 429 ||
    (error.code?.startsWith('over_') ?? false) ||
    /rate limit|too many/i.test(error.message ?? '')
  );
}

export function sendErrorKey(error: MaybeAuthError, method: 'phone' | 'email'): AuthErrorKey {
  if (isRateLimited(error)) return 'tooMany';
  return method === 'phone' ? 'sendFailed' : 'emailFailed';
}

export function verifyErrorKey(error: MaybeAuthError): AuthErrorKey {
  if (isRateLimited(error)) return 'tooMany';
  return 'codeInvalid';
}
