'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { skipPassword } from '@/lib/auth/actions';
import { isRateLimited } from '@/lib/auth/errors';
import { createClient } from '@/lib/supabase/browser';
import { cn } from '@/lib/cn';
import { PasswordField } from '../components/PasswordField';
import { linkButtonClasses } from '../components/styles';

const MIN_LENGTH = 8;

export function SetPasswordForm({ next }: { next: string | null }) {
  const t = useTranslations('auth.setPassword');
  const tErrors = useTranslations('auth.errors');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showError = (message: string) => {
    setError(message);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_LENGTH) return showError(t('tooShort'));
    setBusy(true);
    setError(undefined);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { has_password: true },
      });
      // Re-entering the same password still means they have one.
      if (updateError && updateError.code !== 'same_password') {
        setBusy(false);
        if (updateError.code === 'weak_password') return showError(t('weak'));
        if (updateError.code === 'reauthentication_needed') return showError(t('reauth'));
        if (isRateLimited(updateError)) return showError(tErrors('tooMany'));
        return showError(tErrors('generic'));
      }
      setStatus(t('saved'));
      router.replace(next ?? '/dashboard');
      router.refresh();
    } catch {
      setBusy(false);
      showError(tErrors('generic'));
    }
  };

  return (
    <>
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5 motion-safe:animate-fade-up"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-[clamp(30px,4vw,36px)] leading-[1.1] font-extrabold tracking-[-0.02em]">
            {t('heading')}
          </h1>
          <p className="text-base text-muted">{t('subline')}</p>
        </div>
        <PasswordField
          ref={inputRef}
          id="new-password"
          label={t('label')}
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (error) setError(undefined);
          }}
          autoComplete="new-password"
          hint={t('hint')}
          error={error}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          className="min-h-[52px] w-full disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? t('saving') : t('save')}
        </Button>
      </form>
      <form action={skipPassword.bind(null, next)} className="flex justify-center">
        <button type="submit" disabled={busy} className={cn(linkButtonClasses)}>
          {t('skip')}
        </button>
      </form>
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </>
  );
}
