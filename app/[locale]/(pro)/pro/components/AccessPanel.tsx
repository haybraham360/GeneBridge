'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { proLabels, type Translate } from '@/lib/pro/labels';
import { resources, type RequestDetail, type Resource } from '@/lib/pro/types';
import { requestAccess } from '../actions';

type Props = {
  detail: RequestDetail;
  onChange: (detail: RequestDetail) => void;
  onAnnounce: (message: string) => void;
};

/**
 * "Request access": one ask per missing item and person. The patient gets an
 * in-app notification and decides; nothing is shared until they do.
 */
export function AccessPanel({ detail, onChange, onAnnounce }: Props) {
  const t = useTranslations('pro');
  const tt = t as unknown as Translate;
  const L = useMemo(() => proLabels(tt), [tt]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const ask = (role: 'user' | 'partner', resource: Resource) => {
    const person = detail.people.find((p) => p.role === role)!;
    const name = L.person(person.label);
    setError(false);
    startTransition(async () => {
      const result = await requestAccess({ requestId: detail.id, person: role, resource });
      if (!result.ok) {
        setError(true);
        return;
      }
      onChange({
        ...detail,
        people: detail.people.map((p) =>
          p.role === role && !p.pending.includes(resource) ? { ...p, pending: [...p.pending, resource] } : p,
        ),
      });
      onAnnounce(result.data === 'already_shared' ? t('detail.alreadyShared', { name }) : t('detail.requestSent', { name }));
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="access-panel"
        onClick={() => setOpen((o) => !o)}
        className={buttonClasses('ghost', 'sm', 'self-start')}
      >
        {t('detail.requestAccess')}
        <ChevronDown aria-hidden="true" className={open ? 'size-4 rotate-180' : 'size-4'} strokeWidth={2} />
      </button>
      {open ? (
        <div id="access-panel" className="flex flex-col gap-3 rounded-tile border border-line p-4">
          <div>
            <p className="font-bold">{t('detail.requestAccessTitle')}</p>
            <p className="text-[13px] text-muted">{t('detail.requestAccessBody')}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {detail.people.flatMap((p) =>
              resources
                .filter((r) => p.missing.includes(r))
                .map((r) => {
                  const name = L.person(p.label);
                  const item = r === 'result' ? t('resources.fullReport') : tt(`resources.${r}`);
                  const waiting = p.pending.includes(r);
                  return (
                    <li key={`${p.role}-${r}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{detail.isCouple ? t('detail.missingFor', { item, name }) : item}</span>
                      {waiting ? (
                        <span className="text-[13px] font-semibold text-muted">{t('detail.requested', { name })}</span>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => ask(p.role, r)}
                          className={buttonClasses('ghost', 'sm', 'disabled:opacity-60')}
                        >
                          {t('detail.ask', { name })}
                        </button>
                      )}
                    </li>
                  );
                }),
            )}
          </ul>
          {error ? (
            <p role="alert" className="text-[13px] font-semibold text-danger">
              {t('detail.actions.error')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
