'use client';

import { Check, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { followCondition, unfollowCondition } from '@/app/[locale]/(app)/dashboard/pathActions';
import { buttonClasses } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';

/** "Follow this condition" / "Following" on the condition guide. Private to the person. */
export function FollowToggle({ conditionId, title, following }: { conditionId: string; title: string; following: boolean }) {
  const t = useTranslations('conditions.detail');
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const result = following
        ? await unfollowCondition(conditionId).catch(() => ({ ok: false }))
        : await followCondition(conditionId, 'learning').catch(() => ({ ok: false }));
      if (result.ok) router.refresh();
    });
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
      aria-label={following ? t('unfollowLabel', { condition: title }) : undefined}
      className={buttonClasses('ghost', 'md', 'disabled:cursor-wait')}
    >
      {following ? (
        <Check aria-hidden="true" className="size-5" strokeWidth={2} />
      ) : (
        <Plus aria-hidden="true" className="size-5" strokeWidth={2} />
      )}
      {following ? t('following') : t('follow')}
    </button>
  );
}
