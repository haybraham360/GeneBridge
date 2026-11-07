'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { saveSettings } from '../kycActions';

export function SettingsForm({ language: initialLanguage, notifyEmail: initialNotify }: { language: 'ar' | 'en'; notifyEmail: boolean }) {
  const t = useTranslations('verify.settings');
  const router = useRouter();
  const [language, setLanguage] = useState(initialLanguage);
  const [notifyEmail, setNotifyEmail] = useState(initialNotify);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await saveSettings({ language, notifyEmail }).catch(() => ({ ok: false as const }));
      setStatus(result.ok ? 'saved' : 'error');
      if (result.ok && 'uiLocale' in result && result.uiLocale && result.uiLocale !== initialLanguage) {
        router.replace('/pro/settings', { locale: result.uiLocale });
      }
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className={cn(cardClasses, 'flex max-w-2xl flex-col gap-5 p-[clamp(20px,3vw,32px)]')}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[15px] font-bold">{t('language')}</legend>
        {(['ar', 'en'] as const).map((l) => (
          <label key={l} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
            <input type="radio" name="language" value={l} checked={language === l} onChange={() => setLanguage(l)} className="size-5 cursor-pointer accent-ink" />
            <span lang={l}>{l === 'ar' ? 'العربية' : 'English'}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[15px] font-bold">{t('notifications')}</legend>
        <p className="text-sm text-muted">{t('inApp')}</p>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
          <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} className="size-5 cursor-pointer accent-ink" />
          {t('email')}
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md', 'min-w-40 disabled:cursor-wait disabled:opacity-60')}>
          {t('save')}
        </button>
        <p role="status" aria-live="polite" className={cn('text-sm font-semibold', status === 'saved' ? 'text-success-text' : 'text-danger')}>
          {status === 'idle' ? '' : t(status)}
        </p>
      </div>
    </form>
  );
}
