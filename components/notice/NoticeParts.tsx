import { Check, Heart, Lock, ShieldCheck, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import type { NoticeCondition } from '@/lib/notices/types';
import { NoticeListen } from './NoticeListen';

/*
 * The relative's family notice (design/screens/FamilyNotice.html). Server
 * components: the page works without JavaScript except Listen. Nothing here
 * ever receives anything about the sender beyond a signed first name the
 * sender chose to add.
 *
 * Motion: sections fade up once on load (task 02 preset), nothing with
 * reduced motion. No urgency effects.
 */

const enter = 'motion-safe:animate-fade-up';
const delays = [
  '',
  'motion-safe:[animation-delay:80ms]',
  'motion-safe:[animation-delay:160ms]',
  'motion-safe:[animation-delay:240ms]',
  'motion-safe:[animation-delay:320ms]',
];

// Links that would leave the preview (stop, report) render as plain text there.
type LinkTarget = { href: string } | { preview: true };

const linkClasses =
  'font-bold text-brand-text underline underline-offset-2 hover:text-brand-text-dark';

function NoticeLink({ target, className, children }: { target: LinkTarget; className?: string; children: ReactNode }) {
  if ('preview' in target) {
    return (
      <span aria-disabled="true" className={className}>
        {children}
      </span>
    );
  }
  return (
    // No prefetch: following a link is the only thing that loads the next page.
    <Link href={target.href} prefetch={false} className={className}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

type MainCardProps = {
  conditionId: NoticeCondition | null;
  signedName: string | null;
  /** Spoken by Listen after the main card. */
  listenExtra: string;
};

export function NoticeMainCard({ conditionId, signedName, listenExtra }: MainCardProps) {
  const t = useTranslations('notice');
  const conditionName = conditionId ? t(`conditions.${conditionId}.name`) : null;
  const sender = signedName ? t('signed', { name: signedName }) : t('anonymous');
  const conditionLine = conditionName
    ? `${t('condition.label')} ${conditionName}.`
    : t('condition.none');

  const listen = [t('title'), t('intro'), sender, conditionLine, listenExtra].join(' ');

  return (
    <section
      aria-labelledby="notice-title"
      className={cn(
        cardClasses,
        'flex flex-col gap-[18px] rounded-[28px] p-[clamp(24px,5vw,56px)] shadow-none',
        enter,
      )}
    >
      <Chip icon={Lock} className="self-start">
        {t('chip')}
      </Chip>
      <h1
        id="notice-title"
        className="text-[clamp(30px,4vw,46px)] leading-[1.1] font-extrabold tracking-[-0.02em]"
      >
        {t('title')}
      </h1>
      <p className="max-w-[680px] text-[17px] leading-[1.6] md:text-lg">
        {t('intro')} {sender}
      </p>

      {conditionId && conditionName ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-tile bg-bg px-[18px] py-4">
          <span className="text-base text-muted md:text-sm">{t('condition.label')}</span>
          <span className="text-base font-extrabold">{conditionName}</span>
          <NoticeLink
            target={{ href: `/family-notice/learn/${conditionId}` }}
            className={cn(linkClasses, 'inline-flex min-h-11 items-center text-base md:text-sm')}
          >
            {t('condition.learn', { name: t(`conditions.${conditionId}.inSentence`) })}
          </NoticeLink>
        </div>
      ) : (
        <p className="rounded-tile bg-bg px-[18px] py-4 text-base text-muted">{t('condition.none')}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <TestingButton />
        <NoticeListen text={listen} />
      </div>
    </section>
  );
}

export function TestingButton() {
  const t = useTranslations('notice');
  return (
    <Link
      href="/family-notice/testing"
      prefetch={false}
      className={buttonClasses('primary', 'md', 'min-h-[52px]')}
    >
      {t('testingCta')}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// State card: invalid, expired, stopped
// ---------------------------------------------------------------------------

export function NoticeStateCard({
  state,
  listenExtra,
  children,
}: {
  state: 'invalid' | 'expired' | 'stopped';
  listenExtra: string;
  /** Extra actions, e.g. the stopped state's undo form. */
  children?: ReactNode;
}) {
  const t = useTranslations('notice');
  const title = t(`states.${state}.title`);
  const body = t(`states.${state}.body`);
  return (
    <section
      aria-labelledby="notice-title"
      className={cn(
        cardClasses,
        'flex flex-col gap-[18px] rounded-[28px] p-[clamp(24px,5vw,56px)] shadow-none',
        enter,
      )}
    >
      <Chip icon={Lock} className="self-start">
        {t('chip')}
      </Chip>
      <h1
        id="notice-title"
        className="text-[clamp(28px,4vw,40px)] leading-[1.15] font-extrabold tracking-[-0.02em]"
      >
        {title}
      </h1>
      <p className="max-w-[680px] text-[17px] leading-[1.6] md:text-lg">{body}</p>
      <div className="flex flex-wrap gap-3">
        <TestingButton />
        <NoticeListen text={[title, body, listenExtra].join(' ')} />
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// What this means for you
// ---------------------------------------------------------------------------

const meaningCards = [
  { key: 'notIll', Icon: Heart },
  { key: 'common', Icon: Users },
  { key: 'test', Icon: Check },
] as const;

/** The text Listen reads after the main card. */
export function useMeaningText(): string {
  const t = useTranslations('notice.means');
  return [t('title'), ...meaningCards.flatMap(({ key }) => [`${t(`${key}.title`)}.`, t(`${key}.body`)])].join(' ');
}

export function MeaningCards() {
  const t = useTranslations('notice.means');
  return (
    <section aria-labelledby="means-title" className={cn('flex flex-col gap-4', enter, delays[1])}>
      <h2 id="means-title" className="text-xl font-extrabold tracking-[-0.01em]">
        {t('title')}
      </h2>
      <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {meaningCards.map(({ key, Icon }) => (
          <li key={key} className={cn(cardClasses, 'flex flex-col gap-2.5 p-[22px]')}>
            <Icon aria-hidden="true" className="size-6 text-brand-text" strokeWidth={2} />
            <h3 className="text-[17px] font-extrabold">{t(`${key}.title`)}</h3>
            <p className="text-base leading-[1.55] text-muted md:text-[15px]">{t(`${key}.body`)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Have questions first?
// ---------------------------------------------------------------------------

export function QuestionsCard() {
  const t = useTranslations('notice.questions');
  return (
    <section
      aria-labelledby="questions-title"
      className={cn(
        cardClasses,
        'flex flex-wrap items-center gap-6 p-[clamp(24px,4vw,36px)]',
        enter,
        delays[2],
      )}
    >
      <div className="flex flex-[2_1_360px] flex-col gap-2.5">
        <h2 id="questions-title" className="text-xl font-extrabold tracking-[-0.01em]">
          {t('title')}
        </h2>
        <p className="text-base leading-[1.55] text-muted md:text-[15px]">{t('body')}</p>
      </div>
      <div className="flex flex-[1_1_220px] flex-col gap-2.5">
        <Link href="/family-notice/ask" prefetch={false} className={buttonClasses('dark', 'md')}>
          {t('ask')}
        </Link>
        {/* The counsellor page needs an account: sign up first, then book. */}
        <Link
          href={`/auth?next=${encodeURIComponent('/dashboard/counsellor')}`}
          prefetch={false}
          className={buttonClasses('ghost', 'md')}
        >
          {t('counsellor')}
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Your privacy
// ---------------------------------------------------------------------------

export function PrivacyBox({ code, preview = false, showStop = true }: { code: string | null; preview?: boolean; showStop?: boolean }) {
  const t = useTranslations('notice.privacy');
  const stop: LinkTarget = preview || !code ? { preview: true } : { href: `/family-notice/${code}/stop` };
  const report: LinkTarget = preview || !code ? { preview: true } : { href: `/family-notice/${code}/report` };
  return (
    <section
      aria-labelledby="privacy-title"
      className={cn(
        'flex items-start gap-3.5 rounded-card bg-ink px-[22px] py-5 text-base leading-[1.6] text-white md:text-[15px]',
        enter,
        delays[3],
      )}
    >
      <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 flex-none text-[#FFB896]" strokeWidth={2} />
      <div className="flex flex-col gap-1.5">
        <h2 id="privacy-title" className="font-extrabold">
          {t('title')}
        </h2>
        <p>{t('body')}</p>
        {code || preview ? (
          <p className="flex flex-wrap gap-x-5">
            {showStop ? (
              <NoticeLink
                target={stop}
                className="inline-flex min-h-11 items-center font-bold text-[#FFB896] underline underline-offset-2 hover:text-white"
              >
                {t('stop')}
              </NoticeLink>
            ) : null}
            <NoticeLink
              target={report}
              className="inline-flex min-h-11 items-center text-[#FFD9C7] underline underline-offset-2 hover:text-white"
            >
              {t('report')}
            </NoticeLink>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Page column used by every notice page. */
export function NoticeColumn({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-[1000px] flex-col gap-7 px-6 pt-4 pb-16">
      {children}
    </main>
  );
}
