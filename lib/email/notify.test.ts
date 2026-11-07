import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

const { emailContent } = await import('./notify');

describe('notification emails', () => {
  it('never carry message text, names or health details', () => {
    for (const kind of ['new_message', 'booking_requested', 'booking_confirmed', 'booking_changed', 'booking_cancelled', 'booking_reminder'] as const) {
      for (const locale of ['en', 'ar'] as const) {
        const { subject, text } = emailContent(kind, locale, 'https://genebridge.app');
        expect(text).toContain('https://genebridge.app/');
        expect(`${subject} ${text}`).not.toMatch(/carrier|result|condition|thalass|sickle|Dr\.|\{/i);
      }
    }
    expect(emailContent('new_message', 'en', 'https://x.test').text).toMatch(/^You have a new message on GeneBridge\./);
  });
});
