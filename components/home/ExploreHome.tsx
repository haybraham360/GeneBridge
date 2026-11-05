import { Info, SendHorizontal } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import type { CatalogueCondition } from '@/lib/conditions/search';
import type { UserPathInfo } from '@/lib/user/path';
import { ExploreTiles, FocusSwitcher } from './ExploreTiles';
import { FollowingCard, type FollowedItem } from './FollowingCard';

type Props = {
  locale: string;
  firstName: string | null;
  path: UserPathInfo;
  catalogue: CatalogueCondition[];
  openClaim?: boolean;
};

const steps = ['learn', 'counsellor', 'test', 'result', 'next'] as const;

/**
 * Home on the exploring path (task 11, design HomeExplore): for someone
 * with no result who follows conditions. Every part is shaped by their own
 * followed conditions, and the banner always says it isn't a diagnosis.
 */
export async function ExploreHome({ locale, firstName, path, catalogue, openClaim = false }: Props) {
  const t = await getTranslations('dashboard.explore');
  const byId = new Map(catalogue.map((c) => [c.id, c]));
  const patternName = (c: CatalogueCondition | undefined) => (c?.inheritance ? t(`patterns.${c.inheritance}`) : null);

  const focus = path.focus;
  const condition = focus ? byId.get(focus.conditionId) : undefined;
  const followed: FollowedItem[] = path.followed
    .map((f) => ({ f, c: byId.get(f.conditionId) }))
    .filter((x): x is { f: (typeof path.followed)[number]; c: CatalogueCondition } => Boolean(x.c))
    .map(({ f, c }) => ({ id: c.id, title: c.title, pattern: patternName(c), reason: f.reason }));

  const bold = (chunks: React.ReactNode) => <strong className="font-extrabold">{chunks}</strong>;

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">
          {firstName ? t('welcome', { name: firstName }) : t('welcomeNoName')}
        </h1>
        <p className="text-[15px] text-muted">{t('subtitle')}</p>
      </header>

      <div className="mt-6 flex flex-col gap-5">
        {/* Never a diagnosis (task 11 guardrails). */}
        <p
          data-testid="not-diagnosis-banner"
          className="flex items-start gap-3 rounded-card bg-brand-tint-soft px-5 py-4 text-[15px] leading-[1.6]"
        >
          <Info aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
          <span>
            {condition && focus
              ? t.rich('banner', { condition: condition.title, reason: t(`reasons.${focus.reason}`), b: bold })
              : t.rich('bannerNone', { b: bold })}
          </span>
        </p>

        <FocusSwitcher items={followed.map(({ id, title }) => ({ id, title }))} focusId={focus?.conditionId ?? null} />

        <section aria-labelledby="path-title" className={cn(cardClasses, 'p-6')}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="path-title" className="text-xl font-extrabold tracking-[-0.01em]">
              {t('path.title')}
            </h2>
            <span className="text-sm text-muted">{t('path.pace')}</span>
          </div>
          <ol className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {steps.map((step, i) => (
              <li key={step} className="flex flex-col gap-1.5" aria-current={i === 0 ? 'step' : undefined}>
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-9 rounded-full border-2',
                    i === 0 ? 'border-brand-ring bg-brand' : i === 1 ? 'border-dashed border-neutral-line' : 'border-neutral-line',
                  )}
                />
                <span className="font-bold">{t(`path.steps.${step}.title`)}</span>
                <span className="text-sm text-muted">{t(`path.steps.${step}.meta`)}</span>
              </li>
            ))}
          </ol>
        </section>

        <ExploreTiles
          conditionId={condition?.id ?? null}
          conditionName={condition?.title ?? null}
          pattern={patternName(condition)}
          openClaim={openClaim}
        />

        <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="explore-ask-title" className={cn(cardClasses, 'flex flex-col gap-3 p-6')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="explore-ask-title" className="text-xl font-extrabold tracking-[-0.01em]">
                {condition ? t('ask.title', { condition: condition.title }) : t('ask.titleNone')}
              </h2>
              <span className="flex items-center gap-1.5 text-[13px] text-muted">
                <Info aria-hidden="true" className="size-4" strokeWidth={1.8} />
                {t('ask.badge')}
              </span>
            </div>
            {condition?.suggestedQuestions.length ? (
              <>
                <p className="text-sm text-muted">{t('ask.often')}</p>
                <ul className="flex flex-col gap-2">
                  {condition.suggestedQuestions.map((q) => (
                    <li key={q}>
                      <Link
                        href={`/dashboard/assistant?q=${encodeURIComponent(q)}`}
                        className="flex min-h-11 items-center rounded-tile bg-bg px-4 py-3 font-bold hover:bg-brand-tint-soft"
                      >
                        {q}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {/* A plain GET form: opens Ask GeneBridge with the question. */}
            <form action={`/${locale}/dashboard/assistant`} className="flex gap-2.5">
              <label htmlFor="explore-question" className="sr-only">
                {t('ask.label')}
              </label>
              <input
                id="explore-question"
                name="q"
                required
                maxLength={500}
                dir="auto"
                placeholder={t('ask.placeholder')}
                className="min-h-12 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-5 text-[15px]"
              />
              <button type="submit" aria-label={t('ask.send')} className={buttonClasses('primary', 'md', 'size-12 px-0')}>
                <SendHorizontal aria-hidden="true" className="size-5 rtl:-scale-x-100" strokeWidth={2} />
              </button>
            </form>
          </section>

          <FollowingCard followed={followed} catalogue={catalogue} focusId={focus?.conditionId ?? null} />
        </div>
      </div>
    </main>
  );
}
