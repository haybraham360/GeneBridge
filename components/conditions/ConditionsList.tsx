'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { conditionGuideHref, simulatorHref } from '@/lib/conditions/links';
import { conditionAreas, conditionPatterns, searchConditions, type CatalogueCondition } from '@/lib/conditions/search';

type Pattern = (typeof conditionPatterns)[number];
type Area = (typeof conditionAreas)[number];

/** Patterns where family history matters most: a counsellor note on the card. */
const counsellorPatterns = new Set(['autosomal_dominant', 'x_linked', 'complex']);

/**
 * Conditions A–Z (design Conditions): search by name or gene, filter by
 * inheritance pattern and body area. "In your results" and "Following" come
 * from the person's own data; nothing here is a diagnosis.
 */
export function ConditionsList({
  conditions,
  inResults,
  following,
}: {
  conditions: CatalogueCondition[];
  inResults: string[];
  following: string[];
}) {
  const t = useTranslations('conditions');
  const [query, setQuery] = useState('');
  const [pattern, setPattern] = useState<Pattern | 'all'>('all');
  const [area, setArea] = useState<Area | 'all'>('all');

  const shown = useMemo(
    () =>
      searchConditions(query, conditions).filter(
        (c) => (pattern === 'all' || c.inheritance === pattern) && (area === 'all' || c.area === area),
      ),
    [query, pattern, area, conditions],
  );

  const chip = (on: boolean) =>
    cn(
      'min-h-11 cursor-pointer rounded-full border px-4 text-sm font-bold transition-colors',
      on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-brand-tint-soft',
    );

  return (
    <div className="flex flex-col gap-5">
      <label htmlFor="conditions-search" className="sr-only">
        {t('list.searchLabel')}
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" strokeWidth={2} />
        <input
          id="conditions-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('list.search')}
          className="min-h-[52px] w-full rounded-full border border-line-strong bg-surface ps-12 pe-4 text-base"
        />
      </div>

      <div role="group" aria-labelledby="pattern-label" className="flex flex-wrap items-center gap-2">
        <span id="pattern-label" className="w-16 text-sm font-bold">
          {t('list.pattern')}
        </span>
        {(['all', ...conditionPatterns] as const).map((p) => (
          <button key={p} type="button" aria-pressed={pattern === p} onClick={() => setPattern(p)} className={chip(pattern === p)}>
            {p === 'all' ? t('list.all') : t(`patternFilters.${p}`)}
          </button>
        ))}
      </div>
      <div role="group" aria-labelledby="area-label" className="flex flex-wrap items-center gap-2">
        <span id="area-label" className="w-16 text-sm font-bold">
          {t('list.area')}
        </span>
        {(['all', ...conditionAreas] as const).map((a) => (
          <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)} className={chip(area === a)}>
            {a === 'all' ? t('list.all') : t(`areas.${a}`)}
          </button>
        ))}
      </div>

      <p role="status" className="text-sm text-muted">
        {shown.length ? t('list.count', { shown: shown.length, total: conditions.length }) : t('list.none')}
      </p>

      <ul data-testid="conditions-list" className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        {shown.map((c) => {
          const mine = inResults.includes(c.id);
          const followed = following.includes(c.id);
          return (
            <li key={c.id} className={cn(cardClasses, 'flex flex-col gap-3 p-6', mine && 'border-2 border-brand')}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg leading-tight font-extrabold">{c.title}</h2>
                {mine || followed ? (
                  <span className="flex-none rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand-text-dark">
                    {mine ? t('list.inResults') : t('list.following')}
                  </span>
                ) : null}
              </div>
              <ul className="flex flex-wrap gap-1.5 text-xs font-semibold">
                <li className="rounded-full border border-line px-2.5 py-1">{t(`patterns.${c.inheritance ?? 'complex'}`)}</li>
                {c.gene ? (
                  <li dir="ltr" className="rounded-full border border-line px-2.5 py-1">
                    {t('gene', { gene: c.gene })}
                  </li>
                ) : null}
                <li className="rounded-full border border-line px-2.5 py-1">{t(`areas.${c.area}`)}</li>
              </ul>
              <p className="text-[15px] leading-[1.55] text-muted">{c.cardSummary}</p>
              {counsellorPatterns.has(c.inheritance ?? 'complex') ? (
                <p className="text-sm font-bold text-brand-text-dark">{t('list.familyNote')}</p>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Link
                  href={conditionGuideHref(c.id)}
                  aria-label={t('list.readMoreLabel', { condition: c.title })}
                  className={buttonClasses('ghost', 'sm')}
                >
                  {t('list.readMore')}
                </Link>
                <Link
                  href={simulatorHref(c.id)}
                  aria-label={t('list.howInheritedLabel', { condition: c.title })}
                  className={buttonClasses('ghost', 'sm')}
                >
                  {t('list.howInherited')}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
