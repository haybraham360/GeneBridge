'use client';

import { Globe, MapPin, Phone, Search, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { serviceTypes, type ServiceItem, type ServiceType } from '@/lib/services/types';

/** Care & services (design Services): placeholder listings, filtered in the browser. */
export function ServicesList({ services, initialType }: { services: ServiceItem[]; initialType: ServiceType | 'all' }) {
  const t = useTranslations('services');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ServiceType | 'all'>(initialType);
  const [language, setLanguage] = useState('any');
  const [womenOnly, setWomenOnly] = useState(false);
  const [covered, setCovered] = useState(false);

  const names = useMemo(() => new Intl.DisplayNames([locale], { type: 'language' }), [locale]);
  const allLanguages = useMemo(() => [...new Set(services.flatMap((s) => s.languages))].sort(), [services]);

  const shown = services.filter((s) => {
    const q = query.trim().toLowerCase();
    return (
      (type === 'all' || s.type === type) &&
      (language === 'any' || s.languages.includes(language)) &&
      (!womenOnly || s.womenOnly) &&
      (!covered || s.coverage === 'programme') &&
      (!q || s.name.toLowerCase().includes(q) || (s.area ?? '').toLowerCase().includes(q))
    );
  });

  const toggle = (on: boolean) =>
    cn(
      'min-h-11 cursor-pointer rounded-full border px-4 text-sm font-bold transition-colors',
      on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-brand-tint-soft',
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="services-search" className="sr-only">
          {t('searchLabel')}
        </label>
        <div className="relative min-w-[260px] flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" strokeWidth={2} />
          <input
            id="services-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="min-h-[52px] w-full rounded-full border border-line-strong bg-surface ps-12 pe-4 text-base"
          />
        </div>
        <label className="sr-only" htmlFor="services-language">
          {t('languageLabel')}
        </label>
        <select
          id="services-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-sm font-bold"
        >
          <option value="any">{t('languageAny')}</option>
          {allLanguages.map((code) => (
            <option key={code} value={code}>
              {names.of(code) ?? code}
            </option>
          ))}
        </select>
        <button type="button" aria-pressed={womenOnly} onClick={() => setWomenOnly((v) => !v)} className={toggle(womenOnly)}>
          {t('womenOnly')}
        </button>
        <button type="button" aria-pressed={covered} onClick={() => setCovered((v) => !v)} className={toggle(covered)}>
          {t('covered')}
        </button>
      </div>

      <div role="group" aria-label={t('typesLabel')} className="flex flex-wrap gap-2">
        {(['all', ...serviceTypes] as const).map((value) => (
          <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)} className={toggle(type === value)}>
            {t(`types.${value}`)}
          </button>
        ))}
      </div>

      <p role="status" className="text-sm text-muted">
        {t('count', { count: shown.length })}
      </p>

      <ul data-testid="services-list" className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {shown.map((s) => {
          const callable = /^\+?\d[\d\s-]{5,}$/.test(s.phone);
          return (
            <li key={s.name} className={cn(cardClasses, 'flex flex-col gap-3 p-6')}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg leading-tight font-extrabold">{s.name}</h2>
                <span className="flex-none rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand-text-dark">
                  {t(`types.${s.type}`)}
                </span>
              </div>
              {s.description ? <p className="text-[15px] leading-[1.55] text-muted">{s.description}</p> : null}
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="sr-only">{t('areaLabel')}</dt>
                  <MapPin aria-hidden="true" className="size-4 text-muted" strokeWidth={2} />
                  <dd>{s.area}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="sr-only">{t('languagesLabel')}</dt>
                  <Globe aria-hidden="true" className="size-4 text-muted" strokeWidth={2} />
                  <dd>{s.languages.map((c) => names.of(c) ?? c).join(', ')}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="sr-only">{t('coverageLabel')}</dt>
                  <ShieldCheck aria-hidden="true" className="size-4 text-muted" strokeWidth={2} />
                  <dd>{t(`coverage.${s.coverage}`)}</dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {/* Booking and referrals go through a counsellor for now. */}
                <Link href="/dashboard/counsellor" className={buttonClasses('primary', 'sm')}>
                  {t(`cta.${s.type}`)}
                </Link>
                {callable ? (
                  <a href={`tel:${s.phone.replace(/[\s-]/g, '')}`} aria-label={t('callLabel', { name: s.name })} className={buttonClasses('ghost', 'sm')}>
                    <Phone aria-hidden="true" className="size-4" strokeWidth={2} />
                    {t('call')}
                  </a>
                ) : (
                  <span aria-disabled="true" title={t('phonePending')} className={buttonClasses('ghost', 'sm', 'cursor-default opacity-70 hover:translate-y-0 hover:shadow-none')}>
                    <Phone aria-hidden="true" className="size-4" strokeWidth={2} />
                    {t('call')}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
