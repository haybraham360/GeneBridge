import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TalkPage } from '@/components/talk/TalkPage';
import { supportResources } from '@/config/support-resources';
import { routing } from '@/i18n/routing';
import { aiEnabled } from '@/lib/assistant/claude';
import { getGuides, isGuideId, isRecipient, type GuideId } from '@/lib/talk/guides';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/talk'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'talk.meta' });
  return { title: t('title') };
}

/**
 * Talking to your partner and family (task 09). Guides from the content
 * library; the check-in and drafter run in the browser. `?guide=` opens a
 * guide directly (linked from the assistant and other pages).
 */
export default async function Page({ params, searchParams }: PageProps<'/[locale]/dashboard/talk'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { guide } = await searchParams;
  const initialGuide: GuideId = isGuideId(guide) ? guide : 'partner';

  const supabase = await createClient();
  const [{ data: couple }, { data: saved }] = await Promise.all([
    // The partner's first name, only when both partners agreed to the couple view.
    supabase.rpc('assistant_couple_summary'),
    supabase.from('talk_drafts').select('recipient, body').maybeSingle(),
  ]);
  const partnerRow = (couple as { available: boolean; partner_name: string | null }[] | null)?.[0];
  const partnerName = partnerRow?.available && partnerRow.partner_name ? partnerRow.partner_name.split(' ')[0] : null;
  const savedDraft =
    saved && typeof saved.body === 'string' && isRecipient(saved.recipient)
      ? { recipient: saved.recipient, body: saved.body }
      : null;

  const supportLine = supportResources.find((r) => r.labelKey === 'mentalHealth')?.phone ?? '[CONFIRM]';

  return (
    <TalkPage
      guides={getGuides(locale)}
      initialGuide={initialGuide}
      partnerName={partnerName}
      savedDraft={savedDraft}
      supportLine={supportLine}
      aiChecks={aiEnabled()}
    />
  );
}
