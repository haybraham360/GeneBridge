'use client';

import { BarChart3, Check, Layers, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';
import { addResultFromHome, logExploringTesting, setFocusCondition } from '@/app/[locale]/(app)/dashboard/pathActions';
import { buttonClasses } from '@/components/ui/Button';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { conditionGuideHref, simulatorHref, testingHref } from '@/lib/conditions/links';

const tileClasses =
  'flex h-full flex-col gap-2.5 rounded-card border border-line bg-surface p-6 text-start shadow-card transition-colors hover:bg-brand-tint-soft';

function Tile({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <>
      {icon}
      <span className="text-lg leading-tight font-extrabold">{title}</span>
      <span className="text-[15px] leading-[1.5] text-muted">{body}</span>
    </>
  );
}

const iconClass = 'size-6 text-brand-text';

/** The exploring Home's four tiles (design HomeExplore). */
export function ExploreTiles({
  conditionId,
  conditionName,
  pattern,
  openClaim = false,
}: {
  conditionId: string | null;
  conditionName: string | null;
  pattern: string | null;
  /** Open "Add your result" straight away (e.g. from the couple view). */
  openClaim?: boolean;
}) {
  const t = useTranslations('dashboard.explore');
  const [claiming, setClaiming] = useState(openClaim);

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {conditionId && conditionName ? (
          <>
            <li>
              <Link href={conditionGuideHref(conditionId)} className={tileClasses}>
                <Tile
                  icon={<BarChart3 aria-hidden="true" className={iconClass} strokeWidth={2} />}
                  title={t('tiles.understand.title', { condition: conditionName })}
                  body={t('tiles.understand.body')}
                />
              </Link>
            </li>
            <li>
              <Link href={simulatorHref(conditionId)} className={tileClasses}>
                <Tile
                  icon={<Layers aria-hidden="true" className={iconClass} strokeWidth={2} />}
                  title={t('tiles.passedOn.title')}
                  body={t('tiles.passedOn.body', { pattern: pattern ?? '' })}
                />
              </Link>
            </li>
          </>
        ) : null}
        <li>
          <Link href={testingHref} onClick={() => void logExploringTesting()} className={tileClasses}>
            <Tile
              icon={<MapPin aria-hidden="true" className={iconClass} strokeWidth={2} />}
              title={t('tiles.testing.title')}
              body={t('tiles.testing.body')}
            />
          </Link>
        </li>
        <li>
          <button
            type="button"
            aria-expanded={claiming}
            aria-controls="add-result"
            onClick={() => setClaiming((v) => !v)}
            className={cn(tileClasses, 'w-full cursor-pointer')}
          >
            <Tile
              icon={<Check aria-hidden="true" className={iconClass} strokeWidth={2} />}
              title={t('tiles.result.title')}
              body={t('tiles.result.body')}
            />
          </button>
        </li>
      </ul>
      {claiming ? <AddResultForm onCancel={() => setClaiming(false)} /> : null}
    </div>
  );
}

/** Connects a screening result; Home then switches to the result view. */
function AddResultForm({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations('dashboard.explore.claim');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const result = await addResultFromHome(code).catch(() => ({ status: 'error' as const }));
      if (result.status === 'claimed') {
        router.refresh();
        return;
      }
      setError(result.status === 'not_found' ? t('notFound') : result.status === 'rate_limited' ? t('rateLimited') : t('error'));
    });

  return (
    <form
      id="add-result"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim() && !pending) submit();
      }}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6 shadow-card"
    >
      <h2 className="text-lg font-extrabold">{t('title')}</h2>
      <label htmlFor="home-reference" className="text-sm font-bold">
        {t('label')}
      </label>
      <div className="flex flex-wrap gap-2.5">
        <input
          id="home-reference"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder={t('placeholder')}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'home-reference-error' : undefined}
          className="min-h-12 min-w-0 flex-[1_1_220px] rounded-input border border-line-strong bg-surface px-4 text-start text-base"
        />
        <button type="submit" disabled={pending || !code.trim()} className={buttonClasses('dark', 'md', 'disabled:opacity-60')}>
          {pending ? t('connecting') : t('submit')}
        </button>
        <button type="button" onClick={onCancel} className={buttonClasses('ghost', 'md')}>
          {t('cancel')}
        </button>
      </div>
      {error ? (
        <p id="home-reference-error" role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** Several followed conditions: choose which one Home focuses on. */
export function FocusSwitcher({ items, focusId }: { items: { id: string; title: string }[]; focusId: string | null }) {
  const t = useTranslations('dashboard.explore');
  const router = useRouter();
  const [pending, start] = useTransition();
  if (items.length < 2) return null;
  return (
    <div role="group" aria-label={t('focusLabel')} className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold">{t('focus')}</span>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.id === focusId}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setFocusCondition(item.id);
              router.refresh();
            })
          }
          className={cn(
            'min-h-11 cursor-pointer rounded-full border px-3.5 text-sm font-bold disabled:cursor-wait',
            item.id === focusId ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-brand-tint-soft',
          )}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
}
