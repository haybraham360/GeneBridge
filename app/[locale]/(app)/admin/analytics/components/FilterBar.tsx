'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { filtersQuery, ranges } from '@/lib/analytics/filters';
import type { AnalyticsRange, Filters } from '@/lib/analytics/types';

const selectClasses =
  'min-h-11 cursor-pointer appearance-none rounded-full border border-line bg-surface ps-4 pe-9 text-[13px] font-semibold text-ink transition-colors hover:bg-brand-tint-soft';

/**
 * Date range and centre filters. Native selects, so they work with the
 * keyboard and screen readers as-is. Changing one updates the URL; the page
 * reloads its figures from the server.
 */
export function FilterBar({ filters, centres }: { filters: Filters; centres: string[] }) {
  const t = useTranslations('analytics.filters');
  const router = useRouter();
  const pathname = usePathname();
  const rangeId = useId();
  const centreId = useId();

  function apply(next: Filters) {
    router.replace(`${pathname}${filtersQuery(next)}`, { scroll: false });
  }

  return (
    <>
      <div className="relative">
        <label htmlFor={rangeId} className="sr-only">
          {t('range')}
        </label>
        <select
          id={rangeId}
          className={selectClasses}
          value={filters.range}
          onChange={(e) => apply({ ...filters, range: e.target.value as AnalyticsRange })}
        >
          {ranges.map((range) => (
            <option key={range} value={range}>
              {t(`ranges.${range}`)}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2"
          strokeWidth={2}
        />
      </div>

      <div className="relative">
        <label htmlFor={centreId} className="sr-only">
          {t('centre')}
        </label>
        <select
          id={centreId}
          className={selectClasses}
          value={filters.centre ?? ''}
          onChange={(e) => apply({ ...filters, centre: e.target.value || null })}
        >
          <option value="">{t('allCentres')}</option>
          {centres.map((centre) => (
            <option key={centre} value={centre}>
              {centre}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2"
          strokeWidth={2}
        />
      </div>
    </>
  );
}
