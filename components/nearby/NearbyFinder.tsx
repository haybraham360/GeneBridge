'use client';

import { BadgeCheck, Globe, LocateFixed, MapPin, Navigation, Phone, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useMemo, useRef, useState, useTransition } from 'react';
import { findNearby, findPlaces, noteLocationDenied, noteResultOpened, type NearbyQuery } from '@/app/[locale]/(app)/dashboard/nearby/actions';
import { useViewerTimeZone } from '@/components/booking/useViewerTimeZone';
import { Avatar } from '@/components/directory/DirectoryList';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { emirates, findArea, uaeAreas } from '@/config/uae-areas';
import { Link } from '@/i18n/navigation';
import { whenLabel } from '@/lib/booking/time';
import { cn } from '@/lib/cn';
import { coarsen, directionsUrl, radiusOptions, type Point, type RadiusKm } from '@/lib/nearby/geo';
import type { Place } from '@/lib/nearby/places';
import { mapTiles } from '@/lib/nearby/tiles';
import type { NearbyProfessional, NearbyService } from '@/lib/nearby/types';

const NearbyMap = dynamic(() => import('./NearbyMap'), { ssr: false });

type Item =
  | { key: string; type: 'professional'; distanceKm: number; point: Point; pro: NearbyProfessional }
  | { key: string; type: 'service'; distanceKm: number; point: Point; service: NearbyService };

type Status = 'idle' | 'locating' | 'loading' | 'ok' | 'denied' | 'unavailable' | 'rate' | 'error';
type Where = { method: 'device'; point: Point } | { method: 'place'; point: Point; label: string } | { method: 'area'; areaId: string };

/**
 * Care near you (docs/nearby-care.md). The list is the main view; the map is
 * optional and loads only when opened. A device location is asked for only
 * after a tap, rounded to about 1 km here before it leaves the browser, and
 * kept in memory for this page only.
 */
export function NearbyFinder({ emergencyNumber }: { emergencyNumber: string }) {
  const t = useTranslations('nearby');
  const tl = useTranslations('proOnboarding.labels');
  const ts = useTranslations('services');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  const [where, setWhere] = useState<Where | null>(null);
  const [areaId, setAreaId] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placeStatus, setPlaceStatus] = useState<'idle' | 'searching' | 'rate' | 'error'>('idle');
  const [radius, setRadius] = useState<RadiusKm>(25);
  const [status, setStatus] = useState<Status>('idle');
  const [items, setItems] = useState<Item[]>([]);
  const [show, setShow] = useState<'all' | 'professionals' | 'services'>('all');
  const [language, setLanguage] = useState('any');
  const [womenOnly, setWomenOnly] = useState(false);
  const [thisWeek, setThisWeek] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);

  const names = useMemo(() => new Intl.DisplayNames([locale], { type: 'language' }), [locale]);
  const lang = (code: string) => names.of(code) ?? code;

  const run = (next: Where, km: RadiusKm) => {
    setWhere(next);
    setStatus('loading');
    const query: NearbyQuery =
      next.method === 'area'
        ? { method: 'area', areaId: next.areaId, radiusKm: km, locale }
        : { method: next.method, point: next.point, radiusKm: km, locale };
    startTransition(async () => {
      const result = await findNearby(query).catch(() => ({ status: 'error' as const }));
      if (result.status !== 'ok') {
        setStatus(result.status === 'rate_limited' ? 'rate' : 'error');
        return;
      }
      const list: Item[] = [
        ...result.professionals.map((pro) => ({ key: `p-${pro.userId}`, type: 'professional' as const, distanceKm: pro.distanceKm, point: pro.point, pro })),
        ...result.services.map((service) => ({ key: `s-${service.name}`, type: 'service' as const, distanceKm: service.distanceKm, point: service.point, service })),
      ].sort((a, b) => a.distanceKm - b.distanceKm);
      setItems(list);
      setStatus('ok');
    });
  };

  const useDevice = () => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded before anything else sees it; the precise value is dropped.
        const point = coarsen({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        run({ method: 'device', point }, radius);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          void noteLocationDenied();
        } else setStatus('unavailable');
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
    );
  };

  const searchPlace = () => {
    const q = placeQuery.trim();
    if (q.length < 2) return;
    setPlaceStatus('searching');
    startTransition(async () => {
      const r = await findPlaces(q, locale).catch(() => ({ status: 'error' as const }));
      if (r.status === 'ok') {
        setPlaces(r.places);
        setPlaceStatus('idle');
      } else setPlaceStatus(r.status === 'rate_limited' ? 'rate' : 'error');
    });
  };

  const changeRadius = (km: RadiusKm) => {
    setRadius(km);
    if (where) run(where, km);
  };

  // "This week" is measured from when the page opened.
  const [openedAt] = useState(() => Date.now());
  const shown = useMemo(
    () =>
      items.filter((item) => {
        if (show === 'professionals' && item.type !== 'professional') return false;
        if (show === 'services' && item.type !== 'service') return false;
        const languages = item.type === 'professional' ? item.pro.languages : item.service.languages;
        if (language !== 'any' && !languages.includes(language)) return false;
        if (womenOnly && !(item.type === 'professional' ? item.pro.gender === 'female' : item.service.womenOnly)) return false;
        if (thisWeek) {
          if (item.type !== 'professional' || !item.pro.nextSlot) return false;
          if (Date.parse(item.pro.nextSlot) > openedAt + 7 * 86_400_000) return false;
        }
        return true;
      }),
    [items, show, language, womenOnly, thisWeek, openedAt],
  );
  const allLanguages = [...new Set(items.flatMap((i) => (i.type === 'professional' ? i.pro.languages : i.service.languages)))].sort();

  const centre = useMemo<Point | null>(() => {
    if (!where) return null;
    if (where.method !== 'area') return where.point;
    const a = findArea(where.areaId);
    return a ? { lat: a.lat, lng: a.lng } : null;
  }, [where]);
  const mapItems = useMemo(
    () => shown.map((item, i) => ({ key: item.key, number: i + 1, point: item.point, label: item.type === 'professional' ? item.pro.displayName : item.service.name })),
    [shown],
  );

  const focusItem = (key: string) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  };

  const toggle = (on: boolean) =>
    cn(
      'min-h-11 cursor-pointer rounded-full border px-4 text-sm font-bold transition-colors',
      on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-brand-tint-soft',
    );
  const areaName =
    where?.method === 'area' ? (findArea(where.areaId)?.name[locale === 'ar' ? 'ar' : 'en'] ?? '') : where?.method === 'place' ? where.label : '';
  const message =
    status === 'denied' ? t('denied') : status === 'unavailable' ? t('unavailable') : status === 'rate' ? t('rateLimited') : status === 'error' ? t('error') : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Where to look: shown until a search runs, and again on "Change". */}
      {!where || status === 'loading' || status === 'locating' ? (
        <section aria-labelledby="nearby-where" className={cn(cardClasses, 'flex flex-col gap-5 p-[clamp(20px,3vw,32px)]')}>
          <h2 id="nearby-where" className="text-lg font-extrabold">
            {t('where')}
          </h2>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={useDevice} disabled={status === 'locating' || status === 'loading'} className={buttonClasses('primary', 'md', 'self-start disabled:cursor-wait disabled:opacity-60')}>
              <LocateFixed aria-hidden="true" className="size-5" strokeWidth={2} />
              {t('useLocation')}
            </button>
            <p className="text-sm text-muted">{t('useLocationHelp')}</p>
          </div>
          <p className="text-sm font-bold text-muted">{t('or')}</p>
          <div className="flex flex-col gap-3">
            <form
              role="search"
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                searchPlace();
              }}
            >
              <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
                <label htmlFor="nearby-place" className="text-[15px] font-bold">
                  {t('placeLabel')}
                </label>
                <input
                  id="nearby-place"
                  type="search"
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  placeholder={t('placePlaceholder')}
                  maxLength={120}
                  aria-describedby="nearby-place-help"
                  className="min-h-12 rounded-input border border-line-strong bg-surface px-4 text-base"
                />
              </div>
              <button type="submit" disabled={placeQuery.trim().length < 2 || placeStatus === 'searching'} className={buttonClasses('dark', 'md', 'disabled:cursor-not-allowed disabled:opacity-60')}>
                <Search aria-hidden="true" className="size-5" strokeWidth={2} />
                {t('placeSearch')}
              </button>
            </form>
            <p id="nearby-place-help" className="text-sm text-muted">
              {t('placeHelp')}
            </p>
            <div role="status" aria-live="polite" className="text-sm font-semibold">
              {placeStatus === 'searching' ? t('placeSearching') : placeStatus === 'rate' ? t('rateLimited') : placeStatus === 'error' ? t('placeError') : places && places.length === 0 ? t('placeNone') : null}
            </div>
            {places && places.length ? (
              <ul aria-label={t('placeResults')} className="flex flex-col gap-2" data-testid="place-results">
                {places.map((p) => (
                  <li key={p.label}>
                    <button
                      type="button"
                      onClick={() => run({ method: 'place', point: p.point, label: p.label }, radius)}
                      className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-input border border-line-strong bg-surface px-4 py-2 text-start text-[15px] hover:bg-brand-tint-soft"
                    >
                      <MapPin aria-hidden="true" className="size-4 flex-none text-muted" strokeWidth={2} />
                      {p.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (findArea(areaId)) run({ method: 'area', areaId }, radius);
            }}
          >
            <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <label htmlFor="nearby-area" className="text-[15px] font-bold">
                {t('uaeArea')}
              </label>
              <select id="nearby-area" value={areaId} onChange={(e) => setAreaId(e.target.value)} className="min-h-12 rounded-input border border-line-strong bg-surface px-4 text-base">
                <option value="">{t('areaPlaceholder')}</option>
                {emirates.map((em) => (
                  <optgroup key={em} label={t(`emirates.${em}`)}>
                    {uaeAreas
                      .filter((a) => a.emirate === em)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name[locale === 'ar' ? 'ar' : 'en']}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <button type="submit" disabled={!areaId || status === 'loading'} className={buttonClasses('dark', 'md', 'disabled:cursor-not-allowed disabled:opacity-60')}>
              {t('search')}
            </button>
          </form>
          <p role="status" aria-live="polite" className="text-sm font-semibold">
            {status === 'locating' ? t('locating') : status === 'loading' ? t('loading') : message}
          </p>
        </section>
      ) : null}

      {where && status !== 'loading' && status !== 'locating' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-[15px] font-bold">
              <MapPin aria-hidden="true" className="size-5 text-brand-text" strokeWidth={2} />
              {t('searchingNear', { method: where.method === 'device' ? 'device' : 'other', area: areaName })}
            </p>
            <button type="button" onClick={() => { setWhere(null); setStatus('idle'); setItems([]); setMapOpen(false); }} className="min-h-11 cursor-pointer px-2 text-sm font-bold text-brand-text underline">
              {t('change')}
            </button>
          </div>

          {message ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {message}
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            <div role="group" aria-label={t('radiusLabel')} className="flex flex-wrap gap-2">
              {radiusOptions.map((km) => (
                <button key={km} type="button" aria-pressed={radius === km} onClick={() => changeRadius(km)} className={toggle(radius === km)}>
                  {t('radius', { km })}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label={t('showLabel')} className="flex flex-wrap gap-2">
                {(['all', 'professionals', 'services'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={show === v} onClick={() => setShow(v)} className={toggle(show === v)}>
                    {t(`show.${v}`)}
                  </button>
                ))}
              </div>
              <label htmlFor="nearby-language" className="sr-only">
                {t('languageLabel')}
              </label>
              <select id="nearby-language" value={language} onChange={(e) => setLanguage(e.target.value)} className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-sm font-bold">
                <option value="any">{t('languageAny')}</option>
                {allLanguages.map((code) => (
                  <option key={code} value={code}>
                    {lang(code)}
                  </option>
                ))}
              </select>
              <button type="button" aria-pressed={womenOnly} onClick={() => setWomenOnly((v) => !v)} className={toggle(womenOnly)}>
                {t('womenOnly')}
              </button>
              <button type="button" aria-pressed={thisWeek} onClick={() => setThisWeek((v) => !v)} className={toggle(thisWeek)}>
                {t('thisWeek')}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" aria-live="polite" className="text-sm text-muted">
              {t('count', { count: shown.length, km: radius })}
            </p>
            <button type="button" aria-expanded={mapOpen} aria-controls="nearby-map-area" onClick={() => setMapOpen((v) => !v)} className={buttonClasses('ghost', 'sm')}>
              <MapPin aria-hidden="true" className="size-4" strokeWidth={2} />
              {mapOpen ? t('hideMap') : t('showMap')}
            </button>
          </div>

          <div className={cn('grid gap-6', mapOpen && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
            {mapOpen && centre ? (
              <div id="nearby-map-area" className="flex flex-col gap-2 lg:order-last">
                <div className="lg:sticky lg:top-4">
                  <NearbyMap centre={centre} items={mapItems} onSelect={focusItem} label={t('mapLabel')} />
                  <p className="mt-2 text-xs text-muted">{t('mapNote', { provider: mapTiles.provider })}</p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-4">
              {shown.length === 0 ? (
                <div className={cn(cardClasses, 'flex flex-col items-start gap-3 p-6')} data-testid="nearby-empty">
                  <p className="text-[15px] font-bold">{t('none', { km: radius })}</p>
                  {radius < 100 ? (
                    <button type="button" onClick={() => changeRadius(100)} className={buttonClasses('dark', 'sm')}>
                      {t('widen')}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <ol ref={listRef} aria-label={t('listLabel')} className="flex flex-col gap-4" data-testid="nearby-list">
                {shown.map((item, i) => (
                  <li
                    key={item.key}
                    data-key={item.key}
                    tabIndex={-1}
                    className={cn(cardClasses, 'flex gap-4 p-5 outline-none focus-visible:ring-2 focus-visible:ring-brand')}
                    data-testid="nearby-item"
                    data-type={item.type}
                  >
                    <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-full bg-ink text-[13px] font-extrabold text-white">
                      {i + 1}
                    </span>
                    {item.type === 'professional' ? (
                      professionalCard(item, i)
                    ) : (
                      serviceCard(item)
                    )}
                  </li>
                ))}
              </ol>

              <div className={cn(cardClasses, 'flex flex-wrap items-center justify-between gap-3 bg-brand-tint-soft p-5')}>
                <p className="flex items-center gap-2 text-[15px]">
                  <Globe aria-hidden="true" className="size-5 flex-none text-brand-text" strokeWidth={2} />
                  {t('video')}
                </p>
                <Link href="/dashboard/counsellor" className={buttonClasses('ghost', 'sm')}>
                  {t('videoLink')}
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <p className="text-sm text-muted">{t('notEmergency', { number: emergencyNumber })}</p>
    </div>
  );

  function professionalCard(item: Extract<Item, { type: 'professional' }>, index: number) {
    const e = item.pro;
    const opened = () => void noteResultOpened('professional', item.distanceKm);
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-4">
        <Avatar entry={e} index={index} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-muted">{t('professional')}</p>
          <h3 className="text-[16px] leading-5 font-extrabold">{e.displayName}</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            {e.profession ? tl(`profession.${e.profession}` as 'profession.other') : ''}
            {' · '}
            {e.nextSlot ? t('next', { when: whenLabel(e.nextSlot, zone, locale) }) : t('noSlots')}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-success-text">
            <BadgeCheck aria-hidden="true" className="size-3.5" />
            {t('verified')}
          </p>
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            <div className="flex items-start gap-2">
              <dt className="sr-only">{ts('areaLabel')}</dt>
              <MapPin aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted" strokeWidth={2} />
              <dd>
                <span className="font-bold">{item.distanceKm < 1 ? t('distanceNear') : t('distance', { km: item.distanceKm })}</span>
                {' · '}
                {e.locationLabel}
                {e.address ? `, ${e.address}` : ''}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="sr-only">{ts('languagesLabel')}</dt>
              <Globe aria-hidden="true" className="size-4 flex-none text-muted" strokeWidth={2} />
              <dd>{e.languages.map(lang).join(', ')}</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/dashboard/counsellor?with=${e.userId}`} onClick={opened} aria-label={t('bookAria', { name: e.displayName })} className={buttonClasses('primary', 'sm')}>
              {t('book')}
            </Link>
            <Link href={`/dashboard/messages?with=${e.userId}`} onClick={opened} aria-label={t('messageAria', { name: e.displayName })} className={buttonClasses('ghost', 'sm')}>
              {t('message')}
            </Link>
            <a href={directionsUrl(item.point)} target="_blank" rel="noopener noreferrer" onClick={opened} aria-label={t('directionsAria', { name: e.displayName })} className={buttonClasses('ghost', 'sm')}>
              <Navigation aria-hidden="true" className="size-4" strokeWidth={2} />
              {t('directions')}
            </a>
            <Link href={`/dashboard/counsellor/${e.userId}`} onClick={opened} className="inline-flex min-h-11 items-center px-2 text-[13px] font-bold text-brand-text underline">
              {t('profile')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  function serviceCard(item: Extract<Item, { type: 'service' }>) {
    const s = item.service;
    const callable = /^\+?\d[\d\s-]{5,}$/.test(s.phone);
    const opened = () => void noteResultOpened('service', item.distanceKm);
    return (
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-muted">{t('service')}</p>
            <h3 className="text-[16px] leading-5 font-extrabold">{s.name}</h3>
          </div>
          <span className="flex-none rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand-text-dark">{ts(`types.${s.type}`)}</span>
        </div>
        {s.description ? <p className="mt-1.5 text-[15px] leading-[1.55] text-muted">{s.description}</p> : null}
        <dl className="mt-2 flex flex-col gap-1 text-sm">
          <div className="flex items-start gap-2">
            <dt className="sr-only">{ts('areaLabel')}</dt>
            <MapPin aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted" strokeWidth={2} />
            <dd>
              <span className="font-bold">{item.distanceKm < 1 ? t('distanceNear') : t('distance', { km: item.distanceKm })}</span>
              {' · '}
              {s.address ?? s.area}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">{ts('languagesLabel')}</dt>
            <Globe aria-hidden="true" className="size-4 flex-none text-muted" strokeWidth={2} />
            <dd>{s.languages.map(lang).join(', ')}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">{ts('coverageLabel')}</dt>
            <dd className="text-muted">{ts(`coverage.${s.coverage}`)}</dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={directionsUrl(item.point)} target="_blank" rel="noopener noreferrer" onClick={opened} aria-label={t('directionsAria', { name: s.name })} className={buttonClasses('ghost', 'sm')}>
            <Navigation aria-hidden="true" className="size-4" strokeWidth={2} />
            {t('directions')}
          </a>
          {callable ? (
            <a href={`tel:${s.phone.replace(/[\s-]/g, '')}`} onClick={opened} aria-label={t('callAria', { name: s.name })} className={buttonClasses('ghost', 'sm')}>
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
      </div>
    );
  }
}
