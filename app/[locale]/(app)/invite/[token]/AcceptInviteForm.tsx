'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { acceptInvite, type AcceptState } from './actions';

type AcceptInviteFormProps = {
  token: string;
  /** Where "Not now" leads: onboarding if unfinished, otherwise home. */
  laterHref: '/onboarding' | '/home';
};

export function AcceptInviteForm({ token, laterHref }: AcceptInviteFormProps) {
  const t = useTranslations('onboarding.invitePage');
  const [state, action, pending] = useActionState<AcceptState>(() => acceptInvite(token), {
    status: 'idle',
  });

  if (state.status === 'invalid' || state.status === 'own' || state.status === 'already_linked') {
    const message =
      state.status === 'own' ? t('own') : state.status === 'already_linked' ? t('alreadyLinked') : t('invalid');
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="rounded-tile bg-bg p-4 text-[15px] font-semibold">
          {message}
        </p>
        <Button href={laterHref} variant="dark" className="self-start">
          {t('goHome')}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.status === 'error' ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {t('error')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button href={laterHref} variant="ghost">
          {t('notNow')}
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="min-w-40">
          {pending ? t('accepting') : t('accept')}
        </Button>
      </div>
    </form>
  );
}
