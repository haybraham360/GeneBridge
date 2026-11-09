'use client';

import { Copy, MessageSquarePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, type KeyboardEvent } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import type { Guide, GuideId } from '@/lib/talk/guides';
import { sendTalkEvent } from './talkClient';

/**
 * Guide tabs: an accessible tab list (arrow keys, Home and End; mirrored in
 * Arabic). The selected guide lives in the URL (?guide=) so other pages can
 * link straight to it.
 */
export function GuideTabs({
  guides,
  selected,
  onSelect,
}: {
  guides: Guide[];
  selected: GuideId;
  onSelect: (id: GuideId) => void;
}) {
  const t = useTranslations('talk.tabs');
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = guides.findIndex((g) => g.id === selected);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const next = rtl ? 'ArrowLeft' : 'ArrowRight';
    const prev = rtl ? 'ArrowRight' : 'ArrowLeft';
    let target: number | null = null;
    if (event.key === next) target = (index + 1) % guides.length;
    else if (event.key === prev) target = (index - 1 + guides.length) % guides.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = guides.length - 1;
    if (target === null) return;
    event.preventDefault();
    onSelect(guides[target].id);
    refs.current[target]?.focus();
  };

  return (
    <div role="tablist" aria-label={t('label')} className="flex flex-wrap gap-2.5">
      {guides.map((guide, i) => {
        const on = guide.id === selected;
        return (
          <button
            key={guide.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`talk-tab-${guide.id}`}
            aria-selected={on}
            aria-controls="talk-guide"
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(guide.id)}
            onKeyDown={onKeyDown}
            className={cn(
              'min-h-11 cursor-pointer rounded-full border border-line-strong px-[18px] text-sm font-bold transition-colors duration-200',
              on ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-brand-tint-soft',
            )}
          >
            {guide.label}
          </button>
        );
      })}
    </div>
  );
}

export function GuidePanel({
  guide,
  onCopyPhrase,
  onUsePhrase,
}: {
  guide: Guide;
  onCopyPhrase: (phrase: string) => void;
  onUsePhrase: (phrase: string) => void;
}) {
  const t = useTranslations('talk.guide');
  return (
    <section
      id="talk-guide"
      role="tabpanel"
      aria-labelledby={`talk-tab-${guide.id}`}
      className={cn(cardClasses, 'flex min-w-0 flex-[3_1_460px] flex-col gap-5 p-[clamp(24px,4vw,36px)]')}
    >
      {/* Re-keyed per guide, so the content cross-fades between tabs. */}
      <div key={guide.id} className="flex flex-col gap-5 motion-safe:animate-cross-fade">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-extrabold tracking-[-0.01em]">{guide.title}</h2>
          <p className="text-base leading-[1.55] text-muted">{guide.intro}</p>
        </div>

        <ol className="flex flex-col gap-3">
          {guide.steps.map((step, i) => (
            <li key={step} className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="flex size-[30px] flex-none items-center justify-center rounded-full bg-ink text-[13px] font-extrabold text-white"
              >
                {i + 1}
              </span>
              <span className="pt-[3px] text-base leading-normal">{step}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-2.5">
          <h3 className="text-[15px] font-extrabold">{t('wordsTitle')}</h3>
          <ul className="flex flex-col gap-2.5">
            {guide.phrases.map((phrase) => (
              <li key={phrase} className="flex flex-wrap items-start gap-3 rounded-tile bg-bg px-4 py-3.5">
                <q className="min-w-[200px] flex-1 text-[15px] leading-[1.55]">{phrase}</q>
                <span className="flex flex-none gap-2">
                  <button
                    type="button"
                    onClick={() => onCopyPhrase(phrase)}
                    aria-label={`${t('copyLabel')}: ${phrase}`}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-bold hover:bg-brand-tint-soft"
                  >
                    <Copy aria-hidden="true" className="size-4" strokeWidth={2} />
                    {t('copy')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUsePhrase(phrase)}
                    aria-label={`${t('useLabel')}: ${phrase}`}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-bold hover:bg-brand-tint-soft"
                  >
                    <MessageSquarePlus aria-hidden="true" className="size-4" strokeWidth={2} />
                    {t('use')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {guide.id === 'relatives' ? (
          // Opens the family map's notify flow (task 08).
          <Link href="/dashboard/family?notify=1" className={buttonClasses('dark', 'md', 'self-start')}>
            {t('notice')}
          </Link>
        ) : null}

        <p className="flex flex-col gap-2 border-t border-line pt-4 text-[15px] leading-[1.55] text-muted">
          {t('counsellor')}
          <Link
            href="/dashboard/counsellor?topic=family"
            onClick={() => sendTalkEvent({ name: 'talk_counsellor_clicked' })}
            className="inline-flex min-h-11 items-center self-start font-bold text-brand-text underline underline-offset-2 hover:text-brand-text-dark"
          >
            {t('counsellorLink')}
          </Link>
        </p>
      </div>
    </section>
  );
}
