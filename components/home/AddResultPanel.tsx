'use client';

import { Camera } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { addResultFromHome } from '@/app/[locale]/(app)/dashboard/pathActions';
import { buttonClasses } from '@/components/ui/Button';
import { Link, useRouter } from '@/i18n/navigation';

/**
 * The add-result form on Home for people without a result, opened from the
 * "Add your result" card (/dashboard?addResult=1). Once a result is
 * connected, Home shows it.
 */
export function AddResultPanel() {
  const router = useRouter();
  return <AddResultForm onCancel={() => router.replace('/dashboard', { scroll: false })} />;
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
      {/* Task 12: the same scan flow as onboarding, results and Ask GeneBridge. */}
      <Link href="/dashboard/scan?from=home" className={buttonClasses('primary', 'md', 'self-start')}>
        <Camera aria-hidden="true" className="size-5" strokeWidth={2} />
        {t('photo')}
      </Link>
      <p className="mt-2 text-sm text-muted">{t('or')}</p>
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
