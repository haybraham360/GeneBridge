/**
 * Family notices (task 08, section 8): sender privacy, codes, stop and the
 * weekly limit, at the database level. Needs
 * 20261106000000_family_notices.sql applied and `npm run seed:auth`.
 * Re-seeds the demo notices. Skipped without env vars.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoNotices } from '../../lib/notices/demo';
import { hashPhoneWith } from '../../lib/notices/phoneFormat';
import { noticeSalt, seedNotices } from '../../scripts/lib/noticeSeed';
import { adminClient, anonClient, hasSupabase, persona, signedInAs } from '../supabase';

const code = (key: (typeof demoNotices)[number]['key']) => demoNotices.find((n) => n.key === key)!.code;

/** Distinct test numbers for one run, so reruns don't collide. */
function testPhones(count: number, offset: number): string[] {
  const base = 500_100_000 + (Date.now() % 50_000) * 20 + offset;
  return Array.from({ length: count }, (_, i) => `+971${base + i}`);
}

/** Removes a test sender's notices and send log, so the weekly limit starts at 0. */
async function resetSender(userId: string) {
  const admin = adminClient();
  await admin.from('family_notifications').delete().eq('sender_id', userId);
  await admin.from('notice_sends').delete().eq('sender_id', userId);
}

describe.skipIf(!hasSupabase)('Family notices: database', () => {
  let senderId: string;
  let anon: SupabaseClient;
  let khalid: SupabaseClient;
  let khalidId: string;
  const salt = noticeSalt();

  beforeAll(async () => {
    ({ senderId } = await seedNotices(adminClient()));
    anon = anonClient();
    ({ client: khalid, userId: khalidId } = await signedInAs('khalid'));
    await resetSender(khalidId);
  }, 60_000);

  afterAll(async () => {
    if (khalidId) await resetSender(khalidId);
    await seedNotices(adminClient());
  });

  it('nobody can read the notice tables directly', async () => {
    for (const client of [anon, khalid]) {
      for (const table of ['family_notifications', 'notice_sends', 'notice_suppressions', 'notice_reports', 'notice_events']) {
        const { data, error } = await client.from(table).select('*').limit(1);
        expect(error !== null || (data ?? []).length === 0, `${table} readable`).toBe(true);
      }
    }
  });

  it('the public view returns only status, locale, condition and signed name', async () => {
    const { data, error } = await anon.rpc('family_notice_view', { p_code: code('withCondition'), p_mark_open: false });
    expect(error).toBeNull();
    expect(Object.keys(data as object).sort()).toEqual(['condition_id', 'locale', 'signed_name', 'status']);
    expect(data).toEqual({ status: 'valid', locale: 'en', condition_id: 'sickle_cell_disease', signed_name: null });

    // Nothing that identifies the sender, anywhere in the response.
    const json = JSON.stringify(data);
    const mariam = persona('mariam');
    for (const secret of [senderId, mariam.displayName, mariam.email, mariam.phone]) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain(hashPhoneWith(salt, demoNotices[0].phone));
  });

  it('invalid codes look like any other answer, and expired codes hide the condition', async () => {
    const invalid = await anon.rpc('family_notice_view', { p_code: 'x'.repeat(32), p_mark_open: false });
    expect(invalid.data).toEqual({ status: 'invalid', locale: null, condition_id: null, signed_name: null });

    const expired = await anon.rpc('family_notice_view', { p_code: code('expired'), p_mark_open: false });
    expect(expired.data).toEqual({ status: 'expired', locale: 'en', condition_id: null, signed_name: null });
  });

  it('opening sets opened_at once and records nothing about the visitor', async () => {
    const admin = adminClient();
    await anon.rpc('family_notice_view', { p_code: code('withoutCondition') });
    const first = await admin.from('family_notifications').select('opened_at').eq('code', code('withoutCondition')).single();
    expect(first.data?.opened_at).not.toBeNull();
    await anon.rpc('family_notice_view', { p_code: code('withoutCondition') });
    const second = await admin.from('family_notifications').select('opened_at').eq('code', code('withoutCondition')).single();
    expect(second.data?.opened_at).toBe(first.data?.opened_at);

    // notice_events has no column that could identify a person or a notice.
    const { data: event } = await admin.from('notice_events').select('*').eq('name', 'notice_opened').limit(1).single();
    expect(Object.keys(event ?? {}).sort()).toEqual(['created_at', 'id', 'name', 'props']);
  });

  it('a stopped number never receives another notice', async () => {
    const [phone] = testPhones(1, 0);
    const hash = hashPhoneWith(salt, phone);
    const sent = await khalid.rpc('send_family_notices', {
      p_phone_hashes: [hash],
      p_channel: 'sms',
      p_locale: 'en',
    });
    expect(sent.error).toBeNull();
    const first = (sent.data as { code: string }[])[0].code;

    expect((await anon.rpc('family_notice_stop', { p_code: first })).data).toBe('stopped');
    expect((await anon.rpc('family_notice_view', { p_code: first, p_mark_open: false })).data).toMatchObject({
      status: 'stopped',
      condition_id: null,
    });

    // The sender's call succeeds (so they can't tell), but no notice is created.
    // It still counts toward the weekly limit, so "N more" gives nothing away.
    const again = await khalid.rpc('send_family_notices', { p_phone_hashes: [hash], p_channel: 'sms', p_locale: 'en' });
    expect(again.error).toBeNull();
    expect(again.data).toEqual([]);
    const { count } = await adminClient()
      .from('family_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_phone_hash', hash);
    expect(count).toBe(1);

    // Undo from the same link lets messages through again.
    expect((await anon.rpc('family_notice_undo_stop', { p_code: first })).data).toBe('valid');
  });

  it('refuses an 11th relative in 7 days', async () => {
    await resetSender(khalidId);
    const phones = testPhones(11, 100).map((p) => hashPhoneWith(salt, p));
    const ten = await khalid.rpc('send_family_notices', { p_phone_hashes: phones.slice(0, 10), p_channel: 'whatsapp', p_locale: 'ar' });
    expect(ten.error).toBeNull();
    expect(ten.data).toHaveLength(10);

    const eleventh = await khalid.rpc('send_family_notices', { p_phone_hashes: phones.slice(10), p_channel: 'whatsapp', p_locale: 'ar' });
    expect(eleventh.error?.message).toMatch(/^rate_limited:0/);
  });

  it('only accepts templates: there is no way to send free text', async () => {
    const { error } = await khalid.rpc('send_family_notices', {
      p_phone_hashes: [hashPhoneWith(salt, testPhones(1, 200)[0])],
      p_channel: 'sms',
      p_locale: 'en',
      p_message: 'free text',
    } as Record<string, unknown>);
    expect(error).not.toBeNull();
  });

  it("the sender's own list never says who opened or stopped a notice", async () => {
    const { client: mariam } = await signedInAs('mariam');
    const { data, error } = await mariam.rpc('my_family_notices');
    expect(error).toBeNull();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      expect(Object.keys(row).sort()).toEqual(['anonymous', 'channel', 'condition_included', 'recipients', 'sent_at']);
    }
  });

  it('report misuse answers the same for any code and never exposes the sender', async () => {
    const real = await anon.rpc('family_notice_report', { p_code: code('withCondition'), p_reason: 'unwanted' });
    const fake = await anon.rpc('family_notice_report', { p_code: 'y'.repeat(32), p_reason: 'unwanted' });
    expect(real.data).toBe('reported');
    expect(fake.data).toBe('reported');
  });
});
