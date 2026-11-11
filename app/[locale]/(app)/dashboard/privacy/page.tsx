import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import PrivacyPage, { type AccessRow } from '@/components/privacy/PrivacyPage';
import { loadConsentStatus } from '@/lib/couple/view';
import { consentHistory, liveGrantees, type ConsentRow, type GrantRow, type HistoryItem } from '@/lib/privacy/sharing';
import { createClient } from '@/lib/supabase/server';
import { withdrawCoupleView } from '../couple/actions';
import { revokeAccess } from './actions';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/privacy'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'privacy') : {};
}

type LogRow = { id: string; viewer_name: string | null; resource: string; level: string | null; viewed_at: string };
type NoticeRow = { sent_at: string; recipients: number; anonymous: boolean; condition_included: boolean; channel: string };

/**
 * Privacy & consent, from the signed-in person's own data only: who can see
 * what now (live share grants and the couple view), every read of their
 * shared data, the family messages they sent and their consent history. A
 * new account sees friendly empty states, never demo rows.
 */
export default async function Page({ params }: PageProps<'/[locale]/dashboard/privacy'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const supabase = await createClient();
  const [{ data: log }, { data: notices }, { data: grantData }, { data: consentData }, couple, t, format] = await Promise.all([
    // Guardrail 10: every read of the person's shared data, by whom and when.
    supabase.rpc('my_access_log'),
    // Task 08: the sender's own sends. Nothing about who opened or stopped them.
    supabase.rpc('my_family_notices'),
    supabase.rpc('my_share_grants'),
    supabase.from('consents').select('kind, scope, granted_at, revoked_at').order('granted_at', { ascending: false }).limit(50),
    loadConsentStatus(supabase),
    getTranslations({ locale, namespace: 'dashboard.privacy' }),
    getFormatter({ locale }),
  ]);
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const day = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' });
  const dayTime = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const item = (resource: string, level: string) =>
    resource === 'result' ? tt(`who.items.${level === 'full' ? 'result_full' : 'result_summary'}`) : tt(`who.items.${resource}`);

  const grants = (grantData ?? []) as GrantRow[];
  const consents = (consentData ?? []) as ConsentRow[];

  // Who can see my result: each person I share with, the couple view
  // partner, and relatives (who never see results).
  const access: AccessRow[] = liveGrantees(grants).map((g) => ({
    key: `grant-${g.granteeId}`,
    name: g.name ?? t('who.unnamed'),
    role: g.role === 'professional' ? t('who.roles.professional') : t('who.roles.partner'),
    canSee: g.resources.map((r) => item(r.resource, r.level)),
    since: day(g.since),
    action: { kind: 'revoke', granteeId: g.granteeId },
  }));
  if (couple.linked) {
    const name = couple.partnerName ?? t('who.roles.partner');
    access.push({
      key: 'couple',
      name,
      role: t('who.roles.partner'),
      canSee: couple.meAgreed && couple.meLevel ? [tt(`who.coupleLevels.${couple.meLevel}`)] : [],
      since: couple.meAgreed && couple.agreedAt ? day(couple.agreedAt) : null,
      action: couple.meAgreed ? { kind: 'withdrawCouple' } : { kind: 'setUpCouple' },
    });
  }
  access.push({
    key: 'relatives',
    name: t('who.familyMembers'),
    role: `${t('who.roles.relatives')} · ${t('who.relativesNote')}`,
    canSee: [],
    since: null,
    action: null,
  });

  const accessLog = ((log ?? []) as LogRow[]).map((row) => ({
    // Blind Match (task 17): the compare read the result, the other person
    // never saw it. No name here: they may have chosen to stay "Someone".
    text:
      row.level === 'blind_match' || row.level === 'blind_match_reveal'
        ? tt(row.level === 'blind_match' ? 'accessLogBlindMatch' : 'accessLogBlindMatchReveal')
        : tt('accessLogLine', {
            name: row.viewer_name ?? '',
            resource: tt(`resources.${row.resource === 'result' && row.level === 'full' ? 'resultFull' : row.resource}`),
          }),
    when: dayTime(row.viewed_at),
  }));

  const familyNotices = ((notices ?? []) as NoticeRow[]).map((row) => ({
    text: t('notifications.sentLine', { anonymous: row.anonymous ? 'yes' : 'no', count: row.recipients, channel: row.channel }),
    when: t('notifications.sentMeta', {
      when: format.dateTime(new Date(row.sent_at), { day: 'numeric', month: 'short' }),
      condition: row.condition_included ? 'yes' : 'no',
    }),
  }));

  const someone = t('consent.someone');
  const historyText = (h: HistoryItem): string => {
    switch (h.kind) {
      case 'terms':
        return t('consent.agreed');
      case 'couple_agreed':
        return t('consent.coupleAgreed', { level: h.level ?? 'other' });
      case 'couple_withdrawn':
        return t('consent.coupleWithdrawn');
      case 'compare_values':
        return t('consent.compareValues');
      case 'shared':
        return t('consent.shared', { item: item(h.resource, h.level), name: h.name ?? someone });
      case 'stopped':
        return t('consent.stopped', { item: item(h.resource, 'summary'), name: h.name ?? someone });
    }
  };
  const history = consentHistory(consents, grants).map((h) => ({ text: historyText(h), when: day(h.at) }));

  return (
    <PrivacyPage
      access={access}
      accessEmpty={t('who.empty')}
      accessLog={accessLog}
      accessLogEmpty={t('accessLogEmpty')}
      familyNotices={familyNotices}
      familyNoticesEmpty={t('notifications.empty')}
      consentHistory={history}
      consentHistoryEmpty={t('consent.empty')}
      onRevoke={revokeAccess}
      onWithdrawCouple={withdrawCoupleView}
    />
  );
}
