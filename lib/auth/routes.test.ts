import { describe, expect, it } from 'vitest';
import { sendErrorKey, verifyErrorKey } from './errors';
import { destinationFor, isAnalystPath, isProtectedPath, safeNextPath } from './routes';

describe('destinationFor', () => {
  it('sends new users and unfinished onboarding to /onboarding', () => {
    expect(destinationFor(null, null)).toBe('/onboarding');
    expect(destinationFor({ role: 'individual', onboarding_step: 0 }, null)).toBe('/onboarding');
    expect(destinationFor({ role: 'individual', onboarding_step: 7 }, '/results')).toBe(
      '/onboarding',
    );
  });

  it('sends people who finished onboarding home, or back where they were', () => {
    expect(destinationFor({ role: 'individual', onboarding_step: 8 }, null)).toBe('/dashboard');
    expect(destinationFor({ role: 'individual', onboarding_step: 8 }, '/simulator')).toBe(
      '/simulator',
    );
  });

  it('keeps a partner invite link ahead of unfinished onboarding', () => {
    expect(destinationFor(null, '/invite/abc123')).toBe('/invite/abc123');
    expect(destinationFor({ role: 'individual', onboarding_step: 3 }, '/invite/abc123')).toBe(
      '/invite/abc123',
    );
    expect(destinationFor({ role: 'individual', onboarding_step: 3 }, '/invite')).toBe(
      '/onboarding',
    );
  });

  it('sends counsellors to /pro', () => {
    expect(destinationFor({ role: 'counsellor', onboarding_step: 0 }, null)).toBe('/pro');
  });

  it('sends analysts to the dashboard, never into onboarding or patient screens', () => {
    expect(destinationFor({ role: 'analyst', onboarding_step: 0 }, null)).toBe('/admin/analytics');
    expect(destinationFor({ role: 'analyst', onboarding_step: 8 }, '/results')).toBe(
      '/admin/analytics',
    );
    expect(destinationFor({ role: 'analyst', onboarding_step: 8 }, '/admin/analytics')).toBe(
      '/admin/analytics',
    );
  });
});

describe('safeNextPath', () => {
  it('accepts protected app paths', () => {
    expect(safeNextPath('/home')).toBe('/home');
    expect(safeNextPath('/admin/analytics')).toBe('/admin/analytics');
    expect(safeNextPath('/results?x=1')).toBe('/results');
    expect(safeNextPath('/invite/abc123')).toBe('/invite/abc123');
  });

  it('rejects other sites, odd paths and public pages', () => {
    for (const bad of [
      '//evil.com',
      'https://evil.com',
      '/\\evil.com',
      '/',
      '/auth',
      'home',
      '/homey',
      42,
      undefined,
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});

describe('isProtectedPath', () => {
  it('matches whole segments only', () => {
    expect(isProtectedPath('/pro')).toBe(true);
    expect(isProtectedPath('/pro/sessions')).toBe(true);
    expect(isProtectedPath('/pricing')).toBe(false);
    expect(isProtectedPath('/')).toBe(false);
  });
});

describe('auth error messages', () => {
  it('maps rate limits to "please wait"', () => {
    expect(verifyErrorKey({ status: 429 })).toBe('tooMany');
    expect(sendErrorKey({ code: 'over_sms_send_rate_limit' }, 'phone')).toBe('tooMany');
  });

  it('never distinguishes unknown accounts from wrong codes', () => {
    expect(verifyErrorKey({ status: 403, code: 'otp_expired' })).toBe('codeInvalid');
    expect(verifyErrorKey({ status: 400, code: 'user_not_found' })).toBe('codeInvalid');
    expect(sendErrorKey({ status: 400 }, 'phone')).toBe('sendFailed');
    expect(sendErrorKey({ status: 400 }, 'email')).toBe('emailFailed');
  });
});

describe('isAnalystPath', () => {
  it('covers /admin and everything under it, nothing else', () => {
    expect(isAnalystPath('/admin')).toBe(true);
    expect(isAnalystPath('/admin/analytics')).toBe(true);
    expect(isAnalystPath('/administrator')).toBe(false);
    expect(isAnalystPath('/dashboard')).toBe(false);
  });
});
