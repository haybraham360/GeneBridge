'use client';

import { MessageCircle, ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useTransition } from 'react';
import { saveTalkDraft } from '@/app/[locale]/(app)/dashboard/talk/actions';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { recipients, type GuideId, type Recipient, type TalkLocale, type Tone } from '@/lib/talk/guides';
import { checkDraftPrivacy, type PrivacyFinding } from '@/lib/talk/privacy';
import { copyText, sendTalkEvent } from './talkClient';

export type DrafterHandle = {
  /** "Use in message": puts a phrase into the draft and focuses it. */
  usePhrase: (phrase: string) => void;
  /** A new guide was chosen: preset the recipient and, if untouched, the starter. */
  presetFor: (guide: GuideId, recipient: Recipient, starter: string) => void;
};

type Props = {
  guide: GuideId;
  initialRecipient: Recipient;
  initialText: string;
  /** A draft saved earlier with "Save draft". */
  saved: { recipient: Recipient; body: string } | null;
  /** The classifier double-checks for other people's information (AI mode only). */
  aiChecks: boolean;
  onToast: (message: string) => void;
};

type Share = 'copy' | 'whatsapp';
type Flag = Extract<PrivacyFinding, { flagged: true }>['subject'];

// Drafts stay in this tab only, unless the person taps "Save draft".
const SESSION_KEY = 'gb-talk-draft';

/**
 * "Draft a message together" (task 09 section 4). Tone chips reword the
 * person's own draft; GeneBridge never sends it. Before Copy or WhatsApp,
 * a privacy check looks for someone else's health information.
 */
export const MessageDrafter = forwardRef<DrafterHandle, Props>(function MessageDrafter(
  { guide, initialRecipient, initialText, saved, aiChecks, onToast },
  ref,
) {
  const t = useTranslations('talk.drafter');
  const tPrivacy = useTranslations('talk.privacy');
  const tToast = useTranslations('talk.toast');
  const locale = useLocale() as TalkLocale;

  const [recipient, setRecipient] = useState<Recipient>(saved?.recipient ?? initialRecipient);
  const [text, setText] = useState(saved?.body ?? initialText);
  const [edited, setEdited] = useState(Boolean(saved));
  const [draftLocale, setDraftLocale] = useState<TalkLocale>(locale);
  const [status, setStatus] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [warning, setWarning] = useState<{ flag: Flag; action: Share } | null>(null);
  const [rewriting, startRewrite] = useTransition();
  const [, startSave] = useTransition();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const warningRef = useRef<HTMLDivElement>(null);
  const aiCheck = useRef<{ text: string; who: string | null } | null>(null);

  // Restore this tab's draft (never from the database unless saved).
  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as { text?: string; recipient?: string };
      // Reading browser-only storage after mount.
      if (typeof stored.text === 'string' && stored.text) {
        setText(stored.text);
        setEdited(true);
      }
      if (stored.recipient && (recipients as readonly string[]).includes(stored.recipient)) {
        setRecipient(stored.recipient as Recipient);
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, []);

  useEffect(() => {
    if (edited) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ text, recipient }));
  }, [edited, text, recipient]);

  // AI mode: the classifier's second opinion, a moment after typing stops,
  // so it's ready before Copy or WhatsApp (which must open on the click).
  useEffect(() => {
    if (!aiChecks || !text.trim()) return;
    const current = text;
    const timer = window.setTimeout(async () => {
      const response = await fetch('/api/talk/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', text: current }),
      }).catch(() => null);
      const result = (await response?.json().catch(() => null)) as { flagged?: boolean; who?: string | null } | null;
      aiCheck.current = { text: current, who: result?.flagged ? (result.who ?? '') : null };
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [aiChecks, text]);

  useImperativeHandle(ref, () => ({
    usePhrase(phrase: string) {
      setText((current) => (edited && current.trim() ? `${current.trim()} ${phrase}` : phrase));
      setEdited(true);
      setStatus(null);
      requestAnimationFrame(() => {
        textRef.current?.focus();
        textRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    },
    presetFor(_guide: GuideId, nextRecipient: Recipient, starter: string) {
      setRecipient(nextRecipient);
      if (!edited) {
        setText(starter);
        setDraftLocale(locale);
      }
    },
  }));

  useEffect(() => {
    if (warning) warningRef.current?.focus();
  }, [warning]);

  const rewrite = (tone: Tone) => {
    const target: TalkLocale = tone === 'language' ? (draftLocale === 'en' ? 'ar' : 'en') : draftLocale;
    setStatus(null);
    startRewrite(async () => {
      const response = await fetch('/api/talk/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rewrite', text, tone, guide, recipient, locale: target }),
      }).catch(() => null);
      if (response?.status === 429) {
        setStatus({ kind: 'error', text: t('rateLimited') });
        return;
      }
      const result = (await response?.json().catch(() => null)) as { text?: string; engine?: string } | null;
      if (!response?.ok || !result?.text) {
        setStatus({ kind: 'error', text: t('error') });
        return;
      }
      setText(result.text);
      setEdited(true);
      setDraftLocale(target);
      setStatus({ kind: 'info', text: result.engine === 'template' ? t('templateNote') : t('rewritten') });
    });
  };

  // Rules first; then the classifier's answer if it's for this exact text.
  const findOtherPerson = (): Flag | null => {
    const rules = checkDraftPrivacy(text);
    if (rules.flagged) return rules.subject;
    const ai = aiCheck.current;
    if (ai && ai.text === text && ai.who !== null) return ai.who ? { kind: 'name', name: ai.who } : { kind: 'someone' };
    return null;
  };

  const share = async (action: Share, { checked = false } = {}) => {
    if (!text.trim()) return;
    if (!checked) {
      const flag = findOtherPerson();
      if (flag) {
        setWarning({ flag, action });
        sendTalkEvent({ name: 'draft_privacy_warning_shown' });
        return;
      }
    }
    setWarning(null);
    if (action === 'whatsapp') {
      // Opens WhatsApp with the message; the person chooses who gets it.
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    } else {
      const ok = await copyText(text);
      if (!ok) return;
      onToast(tToast('copiedMessage'));
    }
    sendTalkEvent({ name: 'talk_draft_shared', channel: action });
  };

  const save = () => {
    startSave(async () => {
      const result = await saveTalkDraft({ recipient, body: text }).catch(() => ({ ok: false }));
      setStatus(result.ok ? { kind: 'info', text: t('saved') } : { kind: 'error', text: t('saveError') });
    });
  };

  const who = (flag: Flag) =>
    flag.kind === 'name' ? flag.name : flag.kind === 'relation' ? tPrivacy(`relations.${flag.relation}`) : null;

  const chip =
    'inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold hover:bg-brand-tint-soft disabled:cursor-wait disabled:opacity-60';

  return (
    <section aria-labelledby="drafter-title" className={cn(cardClasses, 'flex flex-col gap-3 p-6')}>
      <div className="flex items-center gap-2.5">
        <MessageCircle aria-hidden="true" className="size-5 text-brand-text" strokeWidth={2} />
        <h2 id="drafter-title" className="text-xl font-extrabold tracking-[-0.01em]">
          {t('title')}
        </h2>
      </div>
      <p className="text-sm text-muted">{t('subtitle')}</p>

      <label htmlFor="talk-recipient" className="text-sm font-bold">
        {t('recipientLabel')}
      </label>
      <select
        id="talk-recipient"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value as Recipient)}
        className="min-h-11 rounded-input border border-line-strong bg-surface px-3 text-[15px]"
      >
        {recipients.map((value) => (
          <option key={value} value={value}>
            {t(`recipients.${value}`)}
          </option>
        ))}
      </select>

      <label htmlFor="talk-draft" className="sr-only">
        {t('textLabel')}
      </label>
      <textarea
        ref={textRef}
        id="talk-draft"
        dir="auto"
        rows={5}
        maxLength={1000}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setEdited(true);
          setWarning(null);
        }}
        aria-busy={rewriting || undefined}
        className="w-full resize-y rounded-input border border-line-strong bg-surface p-3.5 text-[15px] leading-[1.55] text-ink focus-visible:border-ink"
      />

      <div role="group" aria-label={t('tonesLabel')} className="flex flex-wrap gap-2">
        {(['gentler', 'simpler', 'detail'] as const).map((tone) => (
          <button key={tone} type="button" disabled={rewriting || !text.trim()} onClick={() => rewrite(tone)} className={chip}>
            {t(`tones.${tone}`)}
          </button>
        ))}
        <button
          type="button"
          disabled={rewriting || !text.trim()}
          onClick={() => rewrite('language')}
          lang={draftLocale === 'en' ? 'ar' : 'en'}
          className={chip}
        >
          {draftLocale === 'en' ? t('tones.toArabic') : t('tones.toEnglish')}
        </button>
      </div>

      <p role="status" aria-live="polite" className={cn('min-h-5 text-sm', status?.kind === 'error' ? 'text-danger' : 'text-muted')}>
        {rewriting ? t('rewriting') : status?.text}
      </p>

      {warning ? (
        <div
          ref={warningRef}
          tabIndex={-1}
          role="alertdialog"
          aria-labelledby="privacy-warning-title"
          aria-describedby="privacy-warning-body"
          data-testid="privacy-warning"
          className="flex flex-col gap-3 rounded-tile border border-brand-ring bg-brand-tint-soft p-4 focus:outline-none motion-safe:animate-cross-fade"
        >
          <p id="privacy-warning-title" className="flex items-center gap-2 font-extrabold">
            <ShieldAlert aria-hidden="true" className="size-5 text-brand-text" strokeWidth={2} />
            {tPrivacy('title')}
          </p>
          <p id="privacy-warning-body" className="text-sm leading-[1.55]">
            {who(warning.flag) ? tPrivacy('named', { who: who(warning.flag)! }) : tPrivacy('someone')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setWarning(null);
                textRef.current?.focus();
              }}
              className={buttonClasses('dark', 'sm')}
            >
              {tPrivacy('edit')}
            </button>
            <button type="button" onClick={() => share(warning.action, { checked: true })} className={buttonClasses('ghost', 'sm')}>
              {warning.flag.kind === 'name' ? tPrivacy('agreedNamed', { who: warning.flag.name }) : tPrivacy('agreed')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <button type="button" disabled={!text.trim()} onClick={() => share('whatsapp')} className={buttonClasses('primary', 'sm')}>
          {t('whatsapp')}
        </button>
        <button type="button" disabled={!text.trim()} onClick={() => share('copy')} className={buttonClasses('ghost', 'sm')}>
          {t('copy')}
        </button>
        <button type="button" disabled={!text.trim()} onClick={save} className={buttonClasses('ghost', 'sm')}>
          {t('save')}
        </button>
      </div>
      <p className="text-[13px] text-muted">{t('sendNote')}</p>
    </section>
  );
});
