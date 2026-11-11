import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BlindMatch } from '@/components/blind-match/BlindMatch';
import { routing } from '@/i18n/routing';
import type { AssistantLocale } from '@/lib/assistant/types';
import { normaliseCode } from '@/lib/blind-match/code';
import { blindMatchConditions } from '@/lib/blind-match/conditions';
import { parseEligibility, parseOutcome, type HistoryItem } from '@/lib/blind-match/state';
import { getCondition } from '@/lib/conditions/catalogue';
import { currentPerson } from '@/lib/profile/currentPerson';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/blind-match'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'blindMatch.meta' });
  return { title: t('title') };
}

/**
 * Blind Match (task 17, docs/specs/17-blind-match.md). Two people learn
 * whether they both carry a change in the same gene, without either seeing
 * the other's result. Whether someone can take part is checked here, before
 * any session exists.
 */
export default async function Page({ params, searchParams }: PageProps<'/[locale]/dashboard/blind-match'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { code } = await searchParams;

  const supabase = await createClient();
  const [t, person, eligibility, history] = await Promise.all([
    getTranslations({ locale, namespace: 'blindMatch' }),
    currentPerson(supabase),
    supabase.rpc('blind_match_eligibility'),
    supabase.rpc('my_blind_matches'),
  ]);

  type HistoryRow = { id: string; resolved_at: string; other_label: string | null; outcome: string; screened_count: number | null };
  const items: HistoryItem[] = ((history.error ? [] : (history.data ?? [])) as HistoryRow[]).flatMap((r) => {
    const outcome = parseOutcome(r.outcome);
    return outcome ? [{ id: r.id, resolvedAt: r.resolved_at, otherLabel: r.other_label, outcome, screenedCount: r.screened_count ?? 0 }] : [];
  });

  // Names for the "screened for both" list and a mutual reveal, from the catalogue.
  const conditionNames: Record<string, string> = {};
  for (const c of blindMatchConditions) {
    const id = c === 'sickle_cell' ? 'sickle_cell_disease' : c;
    const found = getCondition(id, locale as AssistantLocale);
    if (found) conditionNames[id] = found.title;
  }

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
        <p className="max-w-2xl text-[15px] text-muted">{t('subtitle')}</p>
        <p className="text-xs text-muted">{t('draftNote')}</p>
      </header>
      <BlindMatch
        locale={locale}
        // An error means the database isn't ready (migration not applied), not "no result".
        eligibility={eligibility.error ? 'unavailable' : parseEligibility(eligibility.data)}
        firstName={person.firstName}
        history={items}
        conditionNames={conditionNames}
        initialCode={typeof code === 'string' ? normaliseCode(code) : null}
      />
    </main>
  );
}
