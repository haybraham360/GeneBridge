import type { Metadata } from 'next';
import { Info, MessageSquare } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { FollowToggle } from '@/components/conditions/FollowToggle';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { ListenPill } from '@/components/ui/ListenPill';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { conditionEntry } from '@/lib/conditions/catalogue';
import { servicesHref, simulatorHref, testingHref } from '@/lib/conditions/links';
import { createClient } from '@/lib/supabase/server';
import { loadUserPath } from '@/lib/user/path';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/conditions/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const entry = conditionEntry(id, locale);
  return entry ? { title: `${entry.title} · GeneBridge` } : {};
}

const card = cn(cardClasses, 'flex flex-col gap-3 p-6');
const h2 = 'text-xl font-extrabold tracking-[-0.01em]';

/**
 * A condition guide, personalised (task 11, design ConditionDetail). The
 * banner follows the person's own relationship to the condition: in their
 * results, followed because of family history, followed because they think
 * they may have it, or neither. It never confirms or estimates their status.
 */
export default async function ConditionPage({ params }: PageProps<'/[locale]/dashboard/conditions/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const entry = conditionEntry(id, locale);
  if (!entry) notFound();

  const [t, tc, format, path] = await Promise.all([
    getTranslations({ locale, namespace: 'conditions.detail' }),
    getTranslations({ locale, namespace: 'conditions' }),
    getFormatter({ locale }),
    loadUserPath(await createClient()),
  ]);
  const finding = path.findings.find((f) => f.conditionId === entry.id && f.status !== 'no_variant');
  const followed = path.followed.find((f) => f.conditionId === entry.id);
  const pattern = entry.inheritance ?? 'complex';
  const bold = (chunks: React.ReactNode) => <strong className="font-extrabold">{chunks}</strong>;

  let banner: React.ReactNode = null;
  if (finding) {
    banner = (
      <>
        {t.rich(finding.status === 'carrier' ? 'banner.carrier' : 'banner.affected', { b: bold })}{' '}
        <Link href="/dashboard/results" className="font-bold text-brand-text underline underline-offset-2">
          {t(finding.status === 'carrier' ? 'banner.carrierLink' : 'banner.affectedLink')}
        </Link>
      </>
    );
  } else if (followed?.reason === 'family_history') {
    banner = t.rich('banner.family_history', { condition: entry.title, b: bold });
  } else if (followed?.reason === 'think_i_have') {
    banner = t.rich('banner.think_i_have', { b: bold });
  }

  const checked = format.dateTime(new Date(entry.last_checked), { day: 'numeric', month: 'short', year: 'numeric' });
  const listen = [entry.title, entry.summary, entry.inheritance_plain, entry.carrier_meaning, entry.disease_meaning]
    .filter(Boolean)
    .join(' ');

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{entry.title}</h1>
          <p className="text-[15px] text-muted">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ListenPill text={listen} play={tc('listen')} stop={tc('stop')} label={t('listenLabel')} />
          {finding ? null : <FollowToggle conditionId={entry.id} title={entry.title} following={Boolean(followed)} />}
        </div>
      </header>

      {banner ? (
        <div
          data-testid="condition-banner"
          data-relationship={finding ? 'result' : followed?.reason}
          className="mt-6 flex flex-wrap items-start gap-3 rounded-card bg-brand-tint-soft px-5 py-4 text-[15px] leading-[1.6]"
        >
          <Info aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
          <p className="min-w-0 flex-1">{banner}</p>
          {followed?.reason === 'think_i_have' && !finding ? (
            // Shown prominently for anyone who thinks they may have it.
            <Link href="/dashboard/counsellor" className={buttonClasses('dark', 'sm')}>
              {t('banner.thinkCta')}
            </Link>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
        <li className="rounded-full border border-line bg-surface px-3.5 py-1.5">{tc(`patterns.${pattern}`)}</li>
        {entry.gene ? (
          <li dir="ltr" className="rounded-full border border-line bg-surface px-3.5 py-1.5">
            {tc('gene', { gene: entry.gene })}
          </li>
        ) : null}
        <li className="rounded-full border border-line bg-surface px-3.5 py-1.5">{tc(`areas.${entry.area ?? 'other'}`)}</li>
      </ul>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.8fr_1fr]">
        <div className="flex flex-col gap-5">
          <section className={card}>
            <h2 className={h2}>{t('whatItIs')}</h2>
            <p className="text-base leading-[1.6]">{entry.summary}</p>
          </section>
          {entry.inheritance_plain ? (
            <section className={card}>
              <h2 className={h2}>{t('passedOn')}</h2>
              <p className="text-base leading-[1.6]">{entry.inheritance_plain}</p>
              <Link href={simulatorHref(entry.id)} className={buttonClasses('ghost', 'sm', 'self-start')}>
                {t('simulator')}
              </Link>
            </section>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            {entry.carrier_meaning ? (
              <section className={card}>
                <h2 className={h2}>{t('carrier')}</h2>
                <p className="text-base leading-[1.6]">{entry.carrier_meaning}</p>
              </section>
            ) : null}
            {entry.disease_meaning ? (
              <section className={card}>
                <h2 className={h2}>{t('having')}</h2>
                <p className="text-base leading-[1.6]">{entry.disease_meaning}</p>
              </section>
            ) : null}
          </div>
          <section className="flex flex-col gap-3 rounded-card bg-ink p-6 text-white">
            <h2 className={h2}>{t('couldI.title')}</h2>
            <p className="text-base leading-[1.6]">{t(`couldI.${pattern}`)}</p>
            <div className="flex flex-wrap gap-3">
              <Link href={testingHref} className={buttonClasses('primary', 'md')}>
                {t('couldI.testing')}
              </Link>
              <Link href="/dashboard/counsellor" className={buttonClasses('ghost', 'md')}>
                {t('couldI.counsellor')}
              </Link>
            </div>
          </section>
          {entry.counsellor_questions?.length ? (
            <section className={card}>
              <h2 className={h2}>{t('questions')}</h2>
              <ul className="flex flex-col gap-2">
                {entry.counsellor_questions.map((q) => (
                  <li key={q} className="rounded-input border border-line px-4 py-3 text-[15px]">
                    {q}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-5">
          {entry.care ? (
            <section className={card}>
              <h2 className={h2}>{t('care')}</h2>
              <p className="text-[15px] leading-[1.55] text-muted">{entry.care}</p>
              <Link href={servicesHref} className={buttonClasses('ghost', 'sm')}>
                {t('services')}
              </Link>
            </section>
          ) : null}
          <section className={card}>
            <h2 className={h2}>{t('ask')}</h2>
            <Link
              href={`/dashboard/assistant?q=${encodeURIComponent(entry.suggested_questions?.[0] ?? entry.title)}`}
              className={buttonClasses('dark', 'md')}
            >
              <MessageSquare aria-hidden="true" className="size-5" strokeWidth={2} />
              {t('askCta')}
            </Link>
          </section>
          <section className={card}>
            <h2 className={h2}>{t('sources')}</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {entry.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand-text underline underline-offset-2">
                    {s.publisher}: {s.title}
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{entry.reviewed ? t('reviewed', { date: checked }) : t('review', { date: checked })}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
