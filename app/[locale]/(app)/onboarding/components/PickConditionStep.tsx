'use client';

import { Info, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { searchConditions, type CatalogueCondition } from '@/lib/conditions/search';
import { cn } from '@/lib/cn';

type Props = {
  conditions: CatalogueCondition[];
  selected: string[];
  notSure: boolean;
  onChange: (next: { selected: string[]; notSure: boolean }) => void;
};

/**
 * Step 6 on the exploring path (task 11, design Onboarding-pick-condition):
 * search the catalogue by name or gene, choose one or more, or "I'm not sure
 * yet". Choosing a condition is never treated as a diagnosis.
 */
export function PickConditionStep({ conditions, selected, notSure, onChange }: Props) {
  const t = useTranslations('onboarding.steps.pick');
  const [query, setQuery] = useState('');
  const shown = useMemo(() => searchConditions(query, conditions), [query, conditions]);

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id];
    onChange({ selected: next, notSure: false });
  };

  const chip = (on: boolean) =>
    cn(
      'min-h-11 cursor-pointer rounded-full border px-4 text-[15px] font-bold transition-colors duration-200',
      on ? 'border-brand bg-brand-tint' : 'border-line-strong bg-surface hover:bg-brand-tint-soft',
    );

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="condition-search" className="sr-only">
        {t('searchLabel')}
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" strokeWidth={2} />
        <input
          id="condition-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="min-h-[52px] w-full rounded-input border border-line-strong bg-surface ps-12 pe-4 text-base text-ink placeholder:text-muted/70 focus-visible:border-ink"
        />
      </div>

      <div role="group" aria-label={t('title')} className="flex flex-wrap gap-2.5">
        {shown.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle(c.id)} className={chip(on)}>
              {c.title}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={notSure}
          onClick={() => onChange({ selected: [], notSure: !notSure })}
          className={chip(notSure)}
        >
          {t('notSure')}
        </button>
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted">{t('noMatches')}</p> : null}
      <p role="status" className="sr-only">
        {t('chosen', { count: selected.length })}
      </p>

      <p className="flex items-start gap-3 rounded-tile bg-bg px-4 py-3.5 text-[15px] leading-[1.5]">
        <Info aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
        {t('note')}
      </p>
    </div>
  );
}
