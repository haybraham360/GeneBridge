import { Sparkles, Users } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { cn } from '@/lib/cn';
import { CheckList } from './CheckList';

const sessions = [
  { key: 'session1', tag: 'bg-brand-tint text-brand-text-dark' },
  { key: 'session2', tag: 'bg-affected-tint text-[#991B1B]' },
  { key: 'session3', tag: 'bg-info-tint text-info-text' },
] as const;

export function ForProfessionals() {
  const t = useTranslations('landing.pros');

  return (
    <section id="pros" className="mx-auto mt-28 flex max-w-[1200px] flex-wrap items-center gap-12 px-6">
      <div className="reveal flex min-w-0 flex-[1_1_380px] flex-col gap-[18px]">
        <SectionHeading
          chip={t('chip')}
          chipIcon={Users}
          title={t('title')}
          align="start"
          className="gap-[18px]"
        />
        <CheckList className="gap-3" items={[t('point1'), t('point2'), t('point3'), t('point4'), t('point5')]} />
        <Button href="/auth" variant="dark" className="self-start">
          {t('cta')}
        </Button>
      </div>

      <Card className="reveal flex min-w-0 flex-[1_1_380px] flex-col gap-3 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold">{t('card.title')}</h3>
          <span className="text-[13px] text-muted">{t('card.date')}</span>
        </div>
        <ul className="flex flex-col gap-3">
          {sessions.map(({ key, tag }) => (
            <li key={key} className="flex items-center gap-3 rounded-input bg-bg p-3 transition-[translate,background-color] duration-200 hover:translate-x-1 hover:bg-brand-tint-soft rtl:hover:-translate-x-1">
              <span dir="ltr" className="w-14 shrink-0 font-extrabold">
                {t(`card.${key}.time`)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{t(`card.${key}.name`)}</p>
                <p className="text-[13px] text-muted">{t(`card.${key}.detail`)}</p>
              </div>
              <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', tag)}>
                {t(`card.${key}.tag`)}
              </span>
            </li>
          ))}
        </ul>

        {/*
          After the session: an AI draft the counsellor edits and approves.
          Its lines write themselves in when the card scrolls into view.
        */}
        <div className="mt-1 flex flex-col gap-2.5 rounded-input border border-dashed border-brand-ring bg-brand-tint-soft p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Sparkles aria-hidden="true" className="size-4 shrink-0 text-brand-text" strokeWidth={2.2} />
              {t('card.summary.title')}
            </p>
            <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-brand-text-dark">
              {t('card.summary.status')}
            </span>
          </div>
          <div aria-hidden="true" className="flex flex-col gap-1.5">
            {['w-full', 'w-11/12', 'w-7/12'].map((w, i) => (
              <span key={w} className="block h-2 overflow-hidden rounded-full bg-surface">
                <span
                  className={cn('draw-on-scroll block h-full rounded-full bg-brand/35', w)}
                  style={{ animationRange: `entry ${20 + i * 10}% cover ${45 + i * 5}%` } as CSSProperties}
                />
              </span>
            ))}
          </div>
          <p className="text-[13px] text-muted">{t('card.summary.drafted')}</p>
        </div>
      </Card>
    </section>
  );
}
