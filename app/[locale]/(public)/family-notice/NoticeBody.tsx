import { useTranslations } from 'next-intl';
import { buttonClasses } from '@/components/ui/Button';
import {
  MeaningCards,
  NoticeColumn,
  NoticeMainCard,
  NoticeStateCard,
  PrivacyBox,
  QuestionsCard,
  useMeaningText,
} from '@/components/notice/NoticeParts';
import type { NoticeView } from '@/lib/notices/types';
import { undoStopAction } from './actions';

/**
 * Everything below the header for one notice, in every state (task 08
 * section 4). The preview renders the same thing with `preview`, so senders
 * see exactly what relatives will see.
 */
export function NoticeBody({
  view,
  code,
  preview = false,
}: {
  view: NoticeView;
  code: string | null;
  preview?: boolean;
}) {
  const t = useTranslations('notice');
  const meaning = useMeaningText();

  return (
    <NoticeColumn>
      {view.status === 'valid' ? (
        <NoticeMainCard conditionId={view.conditionId} signedName={view.signedName} listenExtra={meaning} />
      ) : (
        <NoticeStateCard state={view.status} listenExtra={meaning}>
          {view.status === 'stopped' && code ? (
            <form action={undoStopAction}>
              <input type="hidden" name="code" value={code} />
              <button type="submit" className={buttonClasses('ghost', 'md')}>
                {t('states.stopped.undo')}
              </button>
            </form>
          ) : null}
        </NoticeStateCard>
      )}
      <MeaningCards />
      <QuestionsCard />
      <PrivacyBox
        code={view.status === 'invalid' ? null : code}
        preview={preview}
        showStop={view.status !== 'stopped'}
      />
    </NoticeColumn>
  );
}
