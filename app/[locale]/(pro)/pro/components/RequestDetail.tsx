'use client';

import { Check, Lock, MessageSquare } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { proLabels, type Translate } from '@/lib/pro/labels';
import { PROGRAMME_TIME_ZONE } from '@/lib/pro/queue';
import type { PersonDetail, RequestDetail as Detail, Service } from '@/lib/pro/types';
import { AccessPanel } from './AccessPanel';
import { DetailActions } from './DetailActions';
import { SessionNote } from './SessionNote';

type Props = {
  detail: Detail;
  services: Service[];
  onChange: (detail: Detail) => void;
  onClosed: () => void;
  onAnnounce: (message: string) => void;
};

/**
 * One request, top to bottom as in the design. Shows only what each person
 * shared with this counsellor; each section says who shared it.
 */
export function RequestDetail({ detail, services, onChange, onClosed, onAnnounce }: Props) {
  const t = useTranslations('pro');
  const format = useFormatter();
  const L = useMemo(() => proLabels(t as unknown as Translate), [t]);
  const tt = t as unknown as Translate;

  const title = L.request({
    user: detail.people[0].label,
    partner: detail.people[1]?.label ?? null,
  });

  const subtitle = [
    t(detail.isCouple ? 'detail.coupleSession' : 'detail.individualSession'),
    detail.booking
      ? format.dateTime(new Date(detail.booking.startsAt), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
          timeZone: PROGRAMME_TIME_ZONE,
        })
      : t('detail.notBooked'),
    detail.booking ? t(`detail.formats.${detail.booking.format}`) : null,
    L.languages(detail.people) || null,
  ]
    .filter(Boolean)
    .join(' · ');

  const sharers = detail.people.filter((p) => p.sharedAny || (p.role === 'user' && detail.requestSummary));
  const consent = (() => {
    if (!detail.isCouple) return sharers.length ? { tone: 'ok', text: t('detail.consent.patient') } : { tone: 'none', text: t('detail.consent.none') };
    if (sharers.length === detail.people.length) return { tone: 'ok', text: t('detail.consent.both') };
    if (sharers.length === 1) return { tone: 'partial', text: t('detail.consent.one', { name: L.person(sharers[0].label) }) };
    return { tone: 'none', text: t('detail.consent.none') };
  })();

  const withResults = detail.people.filter((p) => p.result);
  const sharedResultButMissing = detail.people.filter((p) => !p.result && !p.missing.includes('result'));
  const questionOwners = detail.people.filter((p) => p.questions && p.questions.length > 0);
  const valueOwners = detail.people.filter((p) => p.valuesShared);
  const summaries: { owner: PersonDetail; text: string }[] = [
    ...(detail.requestSummary ? [{ owner: detail.people[0], text: detail.requestSummary }] : []),
    ...detail.people.filter((p) => p.aiSummary).map((p) => ({ owner: p, text: p.aiSummary as string })),
  ];
  const familyOwners = detail.people.filter((p) => p.familyMapShared);
  const missing = L.missingList(detail);

  const date = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'short' });

  return (
    <article
      aria-labelledby="request-title"
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-[clamp(22px,3vw,32px)] shadow-card"
      data-testid="request-detail"
    >
      {/* 1. Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 id="request-title" className="text-2xl font-extrabold">
            {title}
          </h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold',
            consent.tone === 'ok' && 'border-[#BFE5CB] bg-success-tint text-success-text',
            consent.tone === 'partial' && 'border-brand-ring bg-brand-tint-soft text-brand-text-dark',
            consent.tone === 'none' && 'border-line bg-surface text-ink-soft',
          )}
        >
          {consent.tone === 'ok' ? <Check aria-hidden="true" className="size-4" strokeWidth={2} /> : null}
          {consent.text}
        </span>
      </div>

      {/* 2. Result summaries: one card per person who shared */}
      {withResults.length > 0 || sharedResultButMissing.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {withResults.map((p) => {
            const r = p.result!;
            const name = L.person(p.label);
            const meta = [
              r.reportedAt ? t('detail.reported', { date: date(r.reportedAt) }) : null,
              r.flagged ? null : t('detail.understood', { count: r.understood }),
              r.centre,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={p.role} className="flex flex-col gap-1.5 rounded-tile bg-bg p-4">
                <span className="text-xs font-bold text-muted uppercase">
                  {t(r.level === 'full' ? 'detail.fullLabel' : 'detail.summaryLabel', { name })}
                </span>
                <span className="font-extrabold">{L.resultLine(r)}</span>
                {r.flagged ? (
                  <span className="text-[13px] font-semibold text-brand-text-dark">
                    {t('detail.flaggedNote')}
                    {r.flagReason ? ` · ${tt(`flagReasons.${r.flagReason}`)}` : ''}
                  </span>
                ) : null}
                {meta ? <span className="text-[13px] text-muted">{meta}</span> : null}
              </div>
            );
          })}
          {sharedResultButMissing.map((p) => (
            <div key={p.role} className="flex flex-col gap-1.5 rounded-tile bg-bg p-4">
              <span className="text-xs font-bold text-muted uppercase">
                {t('detail.summaryLabel', { name: L.person(p.label) })}
              </span>
              <span className="text-[13px] text-muted">{t('detail.noResult')}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* 3. Their questions, in their words */}
      {questionOwners.length > 0 ? (
        <section className="flex flex-col gap-2.5" aria-labelledby="questions-title">
          <h3 id="questions-title" className="font-extrabold">
            {t('detail.questionsTitle')}{' '}
            <SharedBy text={L.sharedBy(detail, questionOwners)} />
          </h3>
          <ul className="flex flex-col gap-2">
            {questionOwners.flatMap((p) =>
              (p.questions ?? []).map((q, i) => (
                <li key={`${p.role}-${i}`} className="rounded-xl border border-line px-3.5 py-3 text-[15px]">
                  {q}
                </li>
              )),
            )}
          </ul>
        </section>
      ) : null}

      {/* 4. Values: agreement only, never numbers or a combined score */}
      {valueOwners.length > 0 && detail.values.length > 0 ? (
        <section className="flex flex-col gap-2.5" aria-labelledby="values-title">
          <h3 id="values-title" className="font-extrabold">
            {t('detail.valuesTitle')} <SharedBy text={L.sharedBy(detail, valueOwners)} />
          </h3>
          <dl className="flex flex-col text-sm">
            {detail.values.map((v) => {
              let text: string;
              let differ = false;
              if (v.agreement === 'differ') {
                text = t('detail.values.differ');
                differ = true;
              } else if (v.agreement) {
                text = t('detail.values.both', { band: tt(`detail.bands.${v.agreement}`) });
              } else {
                const owner = v.userBand ? detail.people[0] : detail.people[1];
                const band = v.userBand ?? v.partnerBand;
                text = t('detail.values.single', { name: L.person(owner.label), band: tt(`detail.bands.${band}`) });
              }
              return (
                <div key={v.questionId} className="flex justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                  <dt>{tt(`detail.valueQuestions.${v.questionId}`)}</dt>
                  <dd className={cn('text-end font-bold', differ && 'text-brand-text-dark')}>{text}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}

      {/* 5. Ask GeneBridge summary, only if shared */}
      {summaries.map(({ owner, text }, i) => (
        <section key={i} className="flex flex-col gap-2 rounded-tile bg-brand-tint-soft p-4">
          <h3 className="flex flex-wrap items-center gap-2 font-extrabold">
            <MessageSquare aria-hidden="true" className="size-4.5 text-brand-text" strokeWidth={2} />
            {t('detail.aiTitle')}
            <span className="text-[13px] font-semibold text-muted">
              {t('detail.sharedBy', { name: L.person(owner.label) })}
            </span>
          </h3>
          <p className="text-sm leading-[1.55] whitespace-pre-line">{text}</p>
        </section>
      ))}

      {familyOwners.length > 0 ? (
        <section className="flex flex-col gap-1 rounded-tile bg-bg p-4">
          <h3 className="font-extrabold">{t('detail.familyTitle')}</h3>
          <p className="text-sm text-muted">
            {t('detail.familyShared', { name: L.list(familyOwners.map((p) => L.person(p.label))) })}
          </p>
        </section>
      ) : null}

      {/* 6. Not shared with you + access logging notice */}
      <div className="flex flex-col gap-3">
        <p className="flex items-start gap-2 text-[13px] text-muted">
          <Lock aria-hidden="true" className="mt-0.5 size-4 flex-none" strokeWidth={2} />
          <span>
            {missing ? `${t('detail.notShared', { list: missing })} ` : ''}
            {t(detail.isCouple ? 'detail.logged.couple' : 'detail.logged.single')}
          </span>
        </p>
        {missing ? <AccessPanel detail={detail} onChange={onChange} onAnnounce={onAnnounce} /> : null}
      </div>

      {/* 7. Session note */}
      <SessionNote requestId={detail.id} initialBody={detail.note?.body ?? ''} />

      {/* 8. Actions */}
      <DetailActions
        detail={detail}
        services={services}
        onChange={onChange}
        onClosed={onClosed}
        onAnnounce={onAnnounce}
      />
    </article>
  );
}

function SharedBy({ text }: { text: string | null }) {
  if (!text) return null;
  return <span className="text-[13px] font-semibold text-muted">{text}</span>;
}
