'use client';

import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { followCondition, unfollowCondition } from '@/app/[locale]/(app)/dashboard/pathActions';
import { buttonClasses } from '@/components/ui/Button';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { searchConditions, type CatalogueCondition } from '@/lib/conditions/search';
import { conditionGuideHref } from '@/lib/conditions/links';
import { followReasons, type FollowReason } from '@/lib/user/pathRules';

export type FollowedItem = { id: string; title: string; pattern: string | null; reason: FollowReason };

/**
 * "Conditions you're following" (task 11): open, unfollow, follow another,
 * and a link to talking to family. Private to the person.
 */
export function FollowingCard({
  followed,
  catalogue,
  focusId,
  title,
}: {
  followed: FollowedItem[];
  catalogue: CatalogueCondition[];
  focusId: string | null;
  title?: string;
}) {
  const t = useTranslations('dashboard.explore.following');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [reason, setReason] = useState<FollowReason>('learning');
  const [status, setStatus] = useState<string | null>(null);

  const available = useMemo(
    () => searchConditions(query, catalogue.filter((c) => !followed.some((f) => f.id === c.id))),
    [query, catalogue, followed],
  );

  const unfollow = (item: FollowedItem) =>
    start(async () => {
      const result = await unfollowCondition(item.id).catch(() => ({ ok: false }));
      setStatus(result.ok ? t('unfollowed', { condition: item.title }) : t('error'));
      if (result.ok) router.refresh();
    });

  const follow = () => {
    if (!choice) return;
    const picked = catalogue.find((c) => c.id === choice);
    start(async () => {
      const result = await followCondition(choice, reason).catch(() => ({ ok: false }));
      setStatus(result.ok ? t('followed', { condition: picked?.title ?? choice }) : t('error'));
      if (result.ok) {
        setAdding(false);
        setChoice(null);
        setQuery('');
        router.refresh();
      }
    });
  };

  return (
    <section aria-labelledby="following-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 id="following-title" className="text-xl font-extrabold tracking-[-0.01em]">
        {title ?? t('title')}
      </h2>

      {followed.length === 0 ? <p className="text-sm text-muted">{t('none')}</p> : null}
      <ul className="flex flex-col gap-2.5">
        {followed.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border px-4 py-3',
              item.id === focusId ? 'border-brand' : 'border-line',
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-extrabold">{item.title}</span>
              {item.pattern ? <span className="text-[13px] text-muted">{t('pattern', { pattern: item.pattern })}</span> : null}
            </span>
            <Link
              href={conditionGuideHref(item.id)}
              aria-label={t('openLabel', { condition: item.title })}
              className="inline-flex min-h-11 items-center font-bold text-brand-text underline underline-offset-2"
            >
              {t('open')}
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => unfollow(item)}
              aria-label={t('unfollowLabel', { condition: item.title })}
              className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted hover:text-ink disabled:cursor-wait"
            >
              {t('unfollow')}
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex flex-col gap-3 rounded-tile bg-bg p-4">
          <label htmlFor="follow-search" className="text-sm font-bold">
            {t('pickLabel')}
          </label>
          <input
            id="follow-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="min-h-11 rounded-input border border-line-strong bg-surface px-3 text-[15px]"
          />
          <div role="group" aria-label={t('pickLabel')} className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {available.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={choice === c.id}
                onClick={() => setChoice(c.id)}
                className={cn(
                  'min-h-11 cursor-pointer rounded-full border px-3.5 text-sm font-bold',
                  choice === c.id ? 'border-brand bg-brand-tint' : 'border-line-strong bg-surface hover:bg-brand-tint-soft',
                )}
              >
                {c.title}
              </button>
            ))}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-bold">{t('whyLabel')}</legend>
            {followReasons.map((value) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                <input type="radio" name="follow-reason" checked={reason === value} onChange={() => setReason(value)} className="size-4 accent-ink" />
                {t(`reasons.${value}`)}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!choice || pending} onClick={follow} className={buttonClasses('dark', 'sm', 'disabled:opacity-60')}>
              {t('follow')}
            </button>
            <button type="button" onClick={() => setAdding(false)} className={buttonClasses('ghost', 'sm')}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={buttonClasses('ghost', 'sm', 'w-full')}>
          {t('add')}
        </button>
      )}

      <Link href="/dashboard/talk" className="flex min-h-11 items-center gap-2.5 rounded-tile bg-brand-tint-soft px-4 font-bold">
        <Heart aria-hidden="true" className="size-4 text-brand-text" strokeWidth={2} />
        {t('talk')}
      </Link>
      <p role="status" aria-live="polite" className="text-sm text-muted">
        {status}
      </p>
    </section>
  );
}
