'use server';

import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { logEvents } from '@/lib/auth/events';
import { sendNotice } from '@/lib/messaging/send';
import { hashPhone } from '@/lib/notices/phone';
import { normalisePhone } from '@/lib/notices/phoneFormat';
import {
  cleanSignedName,
  isNoticeChannel,
  isNoticeCondition,
  isNoticeLocale,
  NOTICE_WEEKLY_LIMIT,
  type NoticeChannel,
  type NoticeLocale,
} from '@/lib/notices/types';
import { createClient } from '@/lib/supabase/server';
import type { TreeDiff } from '@/lib/family/diff';
import { treeDiffSchema } from '@/lib/family/diffSchema';
import { saveFamilyDiff } from '@/lib/family/server';

/*
 * "Choose relatives to notify" (task 08 section 6). Templates only: the
 * browser sends phone numbers and options, never message text. Numbers are
 * used once to send and kept only as a salted hash. Family-map names never
 * leave the browser. The sender's own result is never included.
 */

export type SendNoticesInput = {
  phones: string[];
  channel: NoticeChannel;
  locale: NoticeLocale;
  /** Only when "Include the condition name" is ticked. */
  conditionId: string | null;
  anonymous: boolean;
  /** Only when not anonymous. */
  signedName: string | null;
};

export type SendNoticesResult =
  | { status: 'sent'; count: number; devLinks: string[] }
  | { status: 'rate_limited'; remaining: number }
  | { status: 'invalid_phone'; index: number }
  | { status: 'duplicate_phone'; index: number }
  | { status: 'name_required' }
  | { status: 'error' };

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/*
 * Saving the family map (task 13): only what the person kept or edited by
 * hand. The whole resulting tree is validated before one transaction.
 */
export async function saveFamilyChanges(
  diff: TreeDiff,
): Promise<{ status: 'saved' } | { status: 'invalid'; problem: string } | { status: 'error' }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error' };
  const parsed = treeDiffSchema.safeParse(diff);
  if (!parsed.success) return { status: 'invalid', problem: 'shape' };
  const result = await saveFamilyDiff(supabase, user.id, parsed.data);
  return result.status === 'saved' ? { status: 'saved' } : result;
}

export async function sendFamilyNotices(input: SendNoticesInput): Promise<SendNoticesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error' };

  const phones = Array.isArray(input?.phones) ? input.phones : [];
  if (phones.length === 0) return { status: 'error' };
  if (phones.length > NOTICE_WEEKLY_LIMIT) return { status: 'rate_limited', remaining: NOTICE_WEEKLY_LIMIT };
  if (!isNoticeChannel(input.channel) || !isNoticeLocale(input.locale)) return { status: 'error' };

  const anonymous = input.anonymous !== false;
  const signedName = anonymous ? null : cleanSignedName(input.signedName);
  if (!anonymous && !signedName) return { status: 'name_required' };
  const conditionId = input.conditionId && isNoticeCondition(input.conditionId) ? input.conditionId : null;

  const normalised: string[] = [];
  for (const [index, raw] of phones.entries()) {
    const phone = normalisePhone(raw);
    if (!phone) return { status: 'invalid_phone', index };
    if (normalised.includes(phone)) return { status: 'duplicate_phone', index };
    normalised.push(phone);
  }

  const { data, error } = await supabase.rpc('send_family_notices', {
    p_phone_hashes: normalised.map((phone) => hashPhone(phone)),
    p_channel: input.channel,
    p_locale: input.locale,
    p_condition_id: conditionId,
    p_anonymous: anonymous,
    p_signed_name: signedName,
  });
  if (error) {
    const limited = /^rate_limited:(\d+)/.exec(error.message);
    if (limited) return { status: 'rate_limited', remaining: Number(limited[1]) };
    console.error(`sendFamilyNotices failed: ${error.code ?? ''}`);
    return { status: 'error' };
  }

  const origin = await siteOrigin();
  const t = await getTranslations({ locale: input.locale, namespace: 'notice' });
  const created = (data ?? []) as { recipient: number; code: string }[];
  const links: string[] = [];
  for (const { recipient, code } of created) {
    // The link opens in the notice's language. The code is its only parameter.
    const link = `${origin}/${input.locale}/family-notice/${code}`;
    links.push(link);
    await sendNotice({ channel: input.channel, phone: normalised[recipient - 1], text: t('sms', { link }), link });
  }

  await logEvents(supabase, user.id, [
    {
      name: 'family_notification_sent',
      props: { count: phones.length, channel: input.channel, condition_included: conditionId !== null, anonymous },
    },
  ]);

  // Every number counts as sent, so the sender can't tell that a relative
  // stopped messages. Links are shown in development only, for the demo.
  return {
    status: 'sent',
    count: phones.length,
    devLinks: process.env.NODE_ENV === 'production' ? [] : links,
  };
}
