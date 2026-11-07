'use client';

import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { bookSession } from '@/app/[locale]/(app)/dashboard/counsellor/actions';
import { useRouter } from '@/i18n/navigation';
import { whenLabel } from '@/lib/booking/time';
import { shareItems, type ShareItem, type Slot } from '@/lib/booking/types';
import { SlotPicker } from './SlotPicker';
import { useViewerTimeZone } from './useViewerTimeZone';

type Props = {
  professional: { userId: string; displayName: string } | null;
  /** Pre-ticked shares (e.g. the result summary); nothing is shared until Confirm. */
  defaultShare?: ShareItem[];
  /** From /counsellor?topic=family (task 09). */
  familyTopic?: boolean;
  /** The escalation request this booking answers, if any. */
  requestId?: string | null;
  initialSlots?: Slot[];
};

/** "Book with Dr. X" (design: Counsellor), on real free times. */
export function BookingPanel({ professional, defaultShare = ['result', 'values_summary'], familyTopic = false, requestId = null, initialSlots }: Props) {
  const t = useTranslations('booking.panel');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  const router = useRouter();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [share, setShare] = useState<ShareItem[]>(defaultShare);
  const [family, setFamily] = useState(familyTopic);
  const [invite, setInvite] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!professional) {
    return (
      <aside className="rounded-2xl bg-white p-6 shadow-card lg:sticky lg:top-0" data-testid="booking-panel">
        <p className="text-[14px] text-neutral-600">{t('selectFirst')}</p>
      </aside>
    );
  }

  const toggle = (item: ShareItem) => {
    setShare((s) => (s.includes(item) ? s.filter((x) => x !== item) : [...s, item]));
    setMessage(null);
  };

  const confirm = () => {
    if (!slot) return;
    startTransition(async () => {
      const result = await bookSession({
        professionalId: professional.userId,
        startsAt: slot.startsAt,
        format: slot.format,
        share,
        sendInvite: invite,
        familyInvited: family,
        requestId,
      }).catch(() => ({ status: 'error' as const }));
      if (result.status === 'ok') {
        const when = whenLabel(slot.startsAt, zone, locale);
        setMessage({
          kind: 'ok',
          text: result.bookingStatus === 'confirmed' ? t('confirmed', { name: professional.displayName, when }) : t('requested', { name: professional.displayName, when }),
        });
        setSlot(null);
        router.refresh();
      } else {
        setMessage({ kind: 'error', text: t(`errors.${result.status}`) });
        // A taken slot disappears on the next load.
        if (result.status === 'slot_unavailable') setSlot(null);
      }
    });
  };

  return (
    <aside className="rounded-2xl bg-white p-6 shadow-card lg:sticky lg:top-0" data-testid="booking-panel" aria-labelledby="book-title">
      <h2 id="book-title" className="text-[18px] font-extrabold leading-none text-ink">
        {t('title', { name: professional.displayName })}
      </h2>

      <SlotPicker key={professional.userId} professionalId={professional.userId} selected={slot} onSelect={(s) => { setSlot(s); setMessage(null); }} initialSlots={initialSlots} />

      <fieldset className="mt-5 rounded-xl bg-brand/5 p-4">
        <legend className="sr-only">{t('shareLegend')}</legend>
        <p aria-hidden="true" className="text-[13px] font-bold text-ink">{t('shareLegend')}</p>
        <div className="mt-3 flex flex-col gap-3">
          {shareItems.map((item) => (
            <Checkbox key={item} checked={share.includes(item)} onChange={() => toggle(item)} label={t(`share.${item}`)} />
          ))}
        </div>
        <p className="mt-3 text-[12px] text-neutral-600">{t('shareNote')}</p>
      </fieldset>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-neutral-200 p-4">
        <Checkbox checked={family} onChange={() => setFamily((v) => !v)} label={t('family')} hint={t('familyHint')} bold />
        <Checkbox checked={invite} onChange={() => setInvite((v) => !v)} label={t('invite')} hint={t('inviteHint')} bold />
      </div>

      <button
        type="button"
        onClick={confirm}
        disabled={!slot || pending}
        data-testid="confirm-booking"
        className="mt-5 h-13 w-full cursor-pointer rounded-full bg-brand text-[15px] font-bold text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t('confirming') : t('confirm')}
      </button>

      <p
        role="status"
        aria-live="polite"
        data-testid="booking-status"
        className={`mt-3.5 text-center text-[12px] leading-4 ${message?.kind === 'ok' ? 'font-semibold text-[#166534]' : message ? 'font-semibold text-red-700' : 'text-neutral-500'}`}
      >
        {message?.text ?? ''}
      </p>
    </aside>
  );
}

function Checkbox({ checked, onChange, label, hint, bold }: { checked: boolean; onChange: () => void; label: string; hint?: string; bold?: boolean }) {
  return (
    <label className="flex cursor-pointer flex-wrap items-center gap-3 text-[13px] text-neutral-800">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden
        className={`flex h-4 w-4 items-center justify-center rounded-sm border peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 ${
          checked ? 'border-ink bg-ink text-white' : 'border-neutral-600 bg-white'
        }`}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className={bold ? 'font-bold' : undefined}>{label}</span>
      {hint ? <span className="basis-full ps-7 text-[12px] text-neutral-600">{hint}</span> : null}
    </label>
  );
}
