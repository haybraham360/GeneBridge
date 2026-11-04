'use client';

import { Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import type { InviteChannel } from '@/lib/onboarding/events';
import { createInvite } from '../actions';

type InviteStepProps = {
  /** Called after any invite is created, so "Continue" counts as not skipped. */
  onInvited: () => void;
};

/**
 * Step 7. Creates a pending couple link and hands the link to WhatsApp, SMS
 * or the clipboard. The screen and the message both make clear that
 * inviting shares no result.
 */
export function InviteStep({ onInvited }: InviteStepProps) {
  const t = useTranslations('onboarding.steps.invite');
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState(false);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<'linked' | 'error' | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const send = (channel: InviteChannel) => {
    // Open the WhatsApp tab now, inside the click, so it isn't blocked as a
    // pop-up; its address is filled in once the invite exists.
    const whatsappTab = channel === 'whatsapp' ? window.open('', '_blank') : null;

    startTransition(async () => {
      const result = await createInvite(channel);
      if (result.status !== 'ok') {
        whatsappTab?.close();
        setNotice(result.status === 'already_linked' ? 'linked' : 'error');
        return;
      }
      setNotice(null);
      onInvited();
      const text = encodeURIComponent(result.message);

      if (channel === 'whatsapp') {
        const href = `https://wa.me/?text=${text}`;
        if (whatsappTab) {
          whatsappTab.opener = null;
          whatsappTab.location.href = href;
        } else {
          window.location.href = href;
        }
        return;
      }

      if (channel === 'sms') {
        window.location.href = `sms:?&body=${text}`;
        return;
      }

      try {
        await navigator.clipboard.writeText(result.url);
        setManualLink(null);
        setToast(true);
      } catch {
        // Some browsers block clipboard access after a network wait.
        setManualLink(result.url);
      }
    });
  };

  const channelButtons = [
    { channel: 'whatsapp', label: t('whatsapp'), variant: 'dark' },
    { channel: 'sms', label: t('sms'), variant: 'ghost' },
    { channel: 'copy', label: t('copy'), variant: 'ghost' },
  ] as const;

  return (
    <>
      <p className="flex items-start gap-3 rounded-tile bg-bg p-4 text-[15px] leading-normal">
        <Lock aria-hidden="true" className="mt-0.5 size-[22px] flex-none text-brand-text" strokeWidth={2} />
        <span>{t.rich('notice', { strong: (chunks) => <strong>{chunks}</strong> })}</span>
      </p>

      {notice === 'linked' ? (
        <p role="status" className="rounded-tile bg-success-tint p-4 text-[15px] font-semibold text-success-text">
          {t('linked')}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
          {channelButtons.map(({ channel, label, variant }) => (
            <button
              key={channel}
              type="button"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={() => send(channel)}
              className={buttonClasses(variant, 'md', 'w-full px-4 disabled:cursor-wait disabled:opacity-70')}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {notice === 'error' ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {t('error')}
        </p>
      ) : null}

      {manualLink ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-link" className="text-sm font-bold">
            {t('copyManually')}
          </label>
          <input
            id="invite-link"
            readOnly
            dir="ltr"
            value={manualLink}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-12 rounded-input border border-line-strong bg-surface px-4 text-sm"
          />
        </div>
      ) : null}

      {/* Toast: announced politely, then fades out by itself. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast ? (
          <p className="flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white shadow-card motion-safe:animate-fade-up">
            <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
            {t('copied')}
          </p>
        ) : null}
      </div>
    </>
  );
}
