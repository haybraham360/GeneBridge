'use client';

import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { proLabels, type Translate } from '@/lib/pro/labels';
import type { DetailReferral, RequestDetail, Service } from '@/lib/pro/types';
import { createReferral, markAttended, startSession } from '../actions';
import { CloseDialog } from './CloseDialog';
import { SpecialistDialog } from './SpecialistDialog';

type Props = {
  detail: RequestDetail;
  services: Service[];
  onChange: (detail: RequestDetail) => void;
  onClosed: () => void;
  onAnnounce: (message: string) => void;
};

const actionButton = 'min-h-11 w-full text-sm disabled:cursor-not-allowed disabled:opacity-60';

/** Start/join the session, order a confirmatory test, refer, close. */
export function DetailActions({ detail, services, onChange, onClosed, onAnnounce }: Props) {
  const t = useTranslations('pro');
  const tt = t as unknown as Translate;
  const L = useMemo(() => proLabels(tt), [tt]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const specialistRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLDialogElement>(null);

  const inSession = detail.status === 'in_session';
  const attended = Boolean(detail.booking?.attendedAt);
  const confirmatoryOrdered = detail.referrals.some((r) => r.step === 'confirmatory_test' && r.status !== 'cancelled');

  const run = (task: () => Promise<boolean>) => {
    setError(false);
    startTransition(async () => {
      if (!(await task())) setError(true);
    });
  };

  const addReferrals = (step: DetailReferral['step'], serviceName: string | null): DetailReferral[] => [
    ...detail.referrals,
    ...detail.people.map((p) => ({ id: `${step}-${p.role}-${Date.now()}`, step, status: 'ordered' as const, role: p.role, serviceName })),
  ];

  const start = () => {
    // Open the tab inside the click so pop-up blockers allow it.
    const tab = window.open('about:blank', '_blank');
    run(async () => {
      const result = await startSession(detail.id);
      if (!result.ok) {
        tab?.close();
        return false;
      }
      const url = result.data.startsWith('/') ? `/${document.documentElement.lang}${result.data}` : result.data;
      if (tab) tab.location.href = url;
      else window.location.href = url;
      onChange({
        ...detail,
        status: 'in_session',
        booking: {
          startsAt: detail.booking?.startsAt ?? new Date().toISOString(),
          format: detail.booking?.format ?? 'video',
          attendedAt: detail.booking?.attendedAt ?? null,
          meetingUrl: result.data,
        },
      });
      onAnnounce(t('detail.actions.sessionStarted'));
      return true;
    });
  };

  const join = () => {
    const url = detail.booking?.meetingUrl;
    if (!url) return;
    window.open(url.startsWith('/') ? `/${document.documentElement.lang}${url}` : url, '_blank', 'noopener');
  };

  const done = () =>
    run(async () => {
      const result = await markAttended(detail.id);
      if (!result.ok || !detail.booking) return result.ok;
      onChange({ ...detail, booking: { ...detail.booking, attendedAt: new Date().toISOString() } });
      onAnnounce(t('detail.actions.attendedDone'));
      return true;
    });

  const confirmatory = () =>
    run(async () => {
      const result = await createReferral({ requestId: detail.id, step: 'confirmatory_test' });
      if (!result.ok) return false;
      onChange({ ...detail, referrals: addReferrals('confirmatory_test', null) });
      onAnnounce(t('detail.actions.confirmatoryDone'));
      return true;
    });

  return (
    <section aria-label={t('detail.actions.label')} className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
        {inSession && detail.booking?.meetingUrl ? (
          attended ? (
            <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-success-tint px-4 text-sm font-bold text-success-text">
              <CircleCheck aria-hidden="true" className="size-4" strokeWidth={2} />
              {t('detail.actions.attended')}
            </span>
          ) : (
            <>
              <button type="button" onClick={join} className={buttonClasses('primary', 'sm', actionButton)}>
                {t('detail.actions.join')}
              </button>
              <button type="button" disabled={pending} onClick={done} className={buttonClasses('ghost', 'sm', actionButton)}>
                {t('detail.actions.markDone')}
              </button>
            </>
          )
        ) : (
          <button type="button" disabled={pending} onClick={start} className={buttonClasses('primary', 'sm', actionButton)}>
            {t('detail.actions.start')}
          </button>
        )}
        <button
          type="button"
          disabled={pending || confirmatoryOrdered}
          onClick={confirmatory}
          className={buttonClasses('ghost', 'sm', actionButton)}
        >
          {t(confirmatoryOrdered ? 'detail.actions.confirmatoryOrdered' : 'detail.actions.confirmatory')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => specialistRef.current?.showModal()}
          className={buttonClasses('ghost', 'sm', actionButton)}
        >
          {t('detail.actions.specialist')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => closeRef.current?.showModal()}
          className={buttonClasses('ghost', 'sm', actionButton)}
        >
          {t('detail.actions.close')}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {t('detail.actions.error')}
        </p>
      ) : null}

      {detail.referrals.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-tile bg-bg p-4 text-sm">
          <p className="font-bold">{t('detail.referralsTitle')}</p>
          <ul className="flex flex-col gap-1">
            {detail.referrals.map((r) => {
              const person = detail.people.find((p) => p.role === r.role) ?? detail.people[0];
              const step = tt(`detail.steps.${r.step}`) + (r.serviceName ? ` (${r.serviceName})` : '');
              return (
                <li key={r.id}>
                  {t('detail.referralLine', {
                    step,
                    name: L.person(person.label),
                    status: tt(`detail.statuses.${r.status}`),
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <SpecialistDialog
        ref={specialistRef}
        services={services}
        onSubmit={async (service) => {
          const result = await createReferral({ requestId: detail.id, step: 'specialist', serviceId: service.id });
          if (!result.ok) return false;
          onChange({ ...detail, referrals: addReferrals('specialist', service.name) });
          onAnnounce(t('specialist.created'));
          return true;
        }}
      />
      <CloseDialog ref={closeRef} requestId={detail.id} onClosed={onClosed} />
    </section>
  );
}
