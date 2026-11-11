'use client';

import { Check, Copy, EyeOff, KeyRound, Link2, Lock, QrCode, ScanLine, Share2, ShieldCheck, Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import {
  agreeBlindMatch,
  blindMatchState,
  cancelBlindMatch,
  joinBlindMatch,
  noteBlindMatchCounsellor,
  revealBlindMatch,
  startBlindMatch,
} from '@/app/[locale]/(app)/dashboard/blind-match/actions';
import { QrScanner } from '@/app/[locale]/(app)/onboarding/components/QrScanner';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link, useRouter } from '@/i18n/navigation';
import { formatCode, normaliseCode } from '@/lib/blind-match/code';
import type { Eligibility, HistoryItem, MatchState } from '@/lib/blind-match/state';
import { cn } from '@/lib/cn';

type Ineligible = Exclude<Eligibility, 'ok'>;

type Props = {
  locale: string;
  /** 'unavailable' when the database functions can't be reached (not yet set up). */
  eligibility: Eligibility | 'unavailable';
  firstName: string | null;
  history: HistoryItem[];
  /** Condition id → name in this locale, for the screened list and a reveal. */
  conditionNames: Record<string, string>;
  /** From a scanned link (?code=…). */
  initialCode: string | null;
};

type Phase =
  | { kind: 'home' }
  | { kind: 'joining' }
  | { kind: 'code'; sessionId: string; code: string; link: string; qrSvg: string; expiresAt: number }
  | { kind: 'session'; sessionId: string }
  | { kind: 'ineligible'; reason: Ineligible }
  | { kind: 'unavailable' };

const ineligibleHref: Record<Ineligible, string> = {
  flagged: '/dashboard/counsellor?topic=family',
  no_result: '/dashboard?addResult=1',
  unverified: '/dashboard?addResult=1',
  limit: '/dashboard/counsellor',
};

const conditionId = (code: string) => (code === 'sickle_cell' ? 'sickle_cell_disease' : code);

function initialPhase(eligibility: Props['eligibility'], initialCode: string | null): Phase {
  if (eligibility === 'unavailable') return { kind: 'unavailable' };
  if (eligibility !== 'ok') return { kind: 'ineligible', reason: eligibility };
  return initialCode ? { kind: 'joining' } : { kind: 'home' };
}

/** Blind Match (task 17): one answer, neither person sees the other's result. */
export function BlindMatch({ locale, eligibility, firstName, history, conditionNames, initialCode }: Props) {
  const t = useTranslations('blindMatch');
  const format = useFormatter();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() => initialPhase(eligibility, initialCode));
  const [state, setState] = useState<MatchState | null>(null);
  const [showName, setShowName] = useState(Boolean(firstName));
  const [codeInput, setCodeInput] = useState(initialCode ? formatCode(initialCode) : '');
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showScreened, setShowScreened] = useState(false);
  const [showNotCovered, setShowNotCovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();

  const myLabel = showName ? firstName : null;
  const sessionId = phase.kind === 'code' || phase.kind === 'session' ? phase.sessionId : null;
  const name = (label: string | null) => label ?? t('start.someone');
  const conditionName = (code: string) => conditionNames[conditionId(code)] ?? conditionId(code);

  // The code's countdown.
  const secondsLeft = phase.kind === 'code' ? Math.max(0, Math.round((phase.expiresAt - now) / 1000)) : 0;
  const codeExpired = phase.kind === 'code' && (secondsLeft === 0 || state?.status === 'gone');
  useEffect(() => {
    if (phase.kind !== 'code' || codeExpired) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase.kind, codeExpired]);

  const moveOn = useCallback(
    (next: MatchState) => {
      setState(next);
      if (phase.kind === 'code' && next.status !== 'waiting' && next.status !== 'gone') setPhase({ kind: 'session', sessionId: phase.sessionId });
    },
    [phase],
  );

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const next = await blindMatchState(sessionId).catch(() => null);
    if (next) moveOn(next);
  }, [sessionId, moveOn]);

  // Poll while waiting on the other person: to join, to agree, or to tap reveal.
  const waitingOnOther =
    (phase.kind === 'code' && !codeExpired) ||
    (phase.kind === 'session' &&
      (!state ||
        state.status === 'joined' ||
        (state.status === 'resolved' && state.outcome === 'shared' && state.meRevealed && !state.revealedCodes)));
  useEffect(() => {
    if (!waitingOnOther) return;
    const id = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(id);
  }, [waitingOnOther, refresh]);

  const resolved = state?.status === 'resolved';
  useEffect(() => {
    if (resolved) router.refresh();
  }, [resolved, router]);

  const fail = () => setMessage(t('error'));

  const onStart = () =>
    start(async () => {
      setMessage(null);
      const r = await startBlindMatch(locale, myLabel).catch(() => ({ status: 'error' as const }));
      if (r.status === 'ok') {
        setState(null);
        setNow(Date.now());
        setPhase({ kind: 'code', sessionId: r.sessionId, code: r.code, link: r.link, qrSvg: r.qrSvg, expiresAt: new Date(r.expiresAt).getTime() });
      } else if (r.status === 'error') fail();
      else setPhase({ kind: 'ineligible', reason: r.status });
    });

  const onJoin = (raw: string) =>
    start(async () => {
      setMessage(null);
      const code = normaliseCode(raw);
      if (!code) return setMessage(t('join.notFound'));
      const r = await joinBlindMatch(code, myLabel).catch(() => ({ status: 'error' as const }));
      if (r.status === 'ok') {
        setPhase({ kind: 'session', sessionId: r.sessionId });
        setState(await blindMatchState(r.sessionId));
        // Drop ?code= so a refresh doesn't try the used code again.
        router.replace('/dashboard/blind-match');
      } else if (r.status === 'not_found') setMessage(t('join.notFound'));
      else if (r.status === 'rate_limited') setMessage(t('join.rateLimited'));
      else if (r.status === 'error') fail();
      else setPhase({ kind: 'ineligible', reason: r.status });
    });

  const act = (fn: (id: string) => Promise<MatchState>) =>
    start(async () => {
      if (!sessionId) return;
      setMessage(null);
      const next = await fn(sessionId).catch(() => null);
      if (!next) return fail();
      moveOn(next);
    });

  const reset = () => {
    setPhase({ kind: 'home' });
    setState(null);
    setHidden(false);
    setUnderstood(false);
    setShowScreened(false);
    setShowNotCovered(false);
    setMessage(null);
    router.refresh();
  };

  const toCounsellor = () =>
    start(async () => {
      if (sessionId) await noteBlindMatchCounsellor(sessionId).catch(() => undefined);
      router.push('/dashboard/counsellor?topic=family');
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      fail();
    }
  };

  const share = async (link: string) => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('title'), text: t('code.shareText'), url: link });
        return;
      } catch {
        return; // Closed the share sheet: nothing to do.
      }
    }
    await copy(link);
  };

  // ---------------------------------------------------------------- where we are
  const step =
    phase.kind === 'session' && state?.status === 'resolved' ? 2 : phase.kind === 'session' && state?.status === 'joined' ? 1 : 0;
  const showSteps = phase.kind === 'home' || phase.kind === 'joining' || phase.kind === 'code' || phase.kind === 'session';
  const steps = (
    <ol aria-label={t('steps.label')} className="flex items-center gap-2">
      {(['connect', 'agree', 'answer'] as const).map((key, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={key} className="flex flex-1 items-center gap-2" aria-current={current ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-8 flex-none items-center justify-center rounded-full text-sm font-extrabold transition-colors',
                done ? 'bg-success-tint text-success-text' : current ? 'bg-brand text-ink' : 'bg-surface text-muted ring-1 ring-line-strong',
              )}
            >
              {done ? <Check aria-hidden="true" className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn('text-sm font-bold', current ? 'text-ink' : 'text-muted')}>{t(`steps.${key}`)}</span>
            {i < 2 ? <span aria-hidden="true" className={cn('h-0.5 flex-1 rounded-full', done ? 'bg-success-text/40' : 'bg-line-strong')} /> : null}
          </li>
        );
      })}
    </ol>
  );

  // ---------------------------------------------------------------- pieces
  const nameToggle = firstName ? (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
      <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="size-5 accent-brand" />
      <span>
        {t('start.nameLabel')} <span className="font-bold">({firstName})</span>
      </span>
    </label>
  ) : null;

  const explainerPoints = (
    <ul className="flex flex-col gap-2.5 text-[15px] leading-[1.55]">
      {(['private', 'reveals', 'coverage', 'stop', 'choice', 'screen'] as const).map((k) => (
        <li key={k} className={cn('flex items-start gap-2.5', k === 'reveals' && 'font-semibold')}>
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
          {t(`explainer.points.${k}`)}
        </li>
      ))}
    </ul>
  );

  const howItWorks = (
    <section className={cn(cardClasses, 'flex flex-col gap-4 p-6')} aria-labelledby="bm-how">
      <h2 id="bm-how" className="text-xl font-extrabold">
        {t('how.title')}
      </h2>
      <ol className="grid gap-3 sm:grid-cols-3">
        {([
          ['s1', QrCode],
          ['s2', Users],
          ['s3', Lock],
        ] as const).map(([k, Icon], i) => (
          <li key={k} className="flex flex-col gap-2 rounded-tile bg-bg p-4">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-brand-tint text-brand-text-dark">
                <Icon className="size-5" strokeWidth={2} />
              </span>
              <span className="font-extrabold">
                {i + 1}. {t(`how.${k}.title`)}
              </span>
            </span>
            <span className="text-sm leading-normal text-muted">{t(`how.${k}.body`)}</span>
          </li>
        ))}
      </ol>
      <details className="group rounded-tile border border-line px-4 py-3">
        <summary className="min-h-8 cursor-pointer font-bold text-brand-text">{t('explainer.title')}</summary>
        <div className="mt-3">{explainerPoints}</div>
      </details>
    </section>
  );

  const status = message ? (
    <p role="status" aria-live="polite" className="text-sm font-semibold text-brand-text-dark">
      {message}
    </p>
  ) : null;

  const pill = (tone: 'ok' | 'wait' | 'idle', text: string) => (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-bold',
        tone === 'ok' ? 'bg-success-tint text-success-text' : tone === 'wait' ? 'bg-brand-tint text-brand-text-dark' : 'bg-bg text-muted',
      )}
    >
      {text}
    </span>
  );

  const avatar = (letter: string, mine: boolean) => (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 flex-none items-center justify-center rounded-full font-extrabold',
        mine ? 'bg-brand-tint text-brand-text-dark' : 'bg-info-tint text-info-text',
      )}
    >
      {letter}
    </span>
  );

  // Both people, live: who has joined and who has agreed.
  const peopleCard =
    phase.kind === 'code' || (phase.kind === 'session' && state && state.status !== 'resolved' && state.status !== 'gone') ? (
      <section className={cn(cardClasses, 'flex flex-col gap-3 p-6')} data-testid="blind-match-people">
        <h2 className="text-xl font-extrabold">
          {t('people.title')}
        </h2>
        <div className="flex items-center gap-3 rounded-tile bg-bg px-4 py-3">
          {avatar((firstName ?? t('people.you')).charAt(0).toLocaleUpperCase(), true)}
          <span className="flex-1 font-bold">{t('people.you')}</span>
          {state?.meAgreed ? pill('ok', t('people.agreed')) : pill('idle', t('people.notYet'))}
        </div>
        <div className="flex items-center gap-3 rounded-tile bg-bg px-4 py-3">
          {phase.kind === 'code' ? (
            <>
              <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-full border-2 border-dashed border-line-strong" />
              <span className="flex-1 font-bold text-muted">…</span>
              {pill('wait', t('people.waiting'))}
            </>
          ) : (
            <>
              {avatar(name(state?.otherLabel ?? null).charAt(0).toLocaleUpperCase(), false)}
              <span className="flex-1 font-bold">{name(state?.otherLabel ?? null)}</span>
              {state?.otherAgreed ? pill('ok', t('people.agreed')) : pill('wait', t('people.joined'))}
            </>
          )}
        </div>
      </section>
    ) : null;

  const historyCard = (
    <section className={cn(cardClasses, 'flex flex-col gap-3 p-6')} aria-labelledby="bm-history" data-testid="blind-match-history">
      <div className="flex flex-col gap-1">
        <h2 id="bm-history" className="text-xl font-extrabold">
          {t('history.title')}
        </h2>
        <p className="text-sm text-muted">{t('history.body')}</p>
      </div>
      {history.length === 0 ? (
        <p className="text-[15px] text-muted">{t('history.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {history.map((h) => (
            <li key={h.id} className="flex flex-col gap-0.5 rounded-tile bg-bg px-4 py-3 text-[15px]">
              <span className="font-bold">{t('history.with', { name: name(h.otherLabel) })}</span>
              <span className="text-sm text-muted">
                {t(`history.outcome.${h.outcome}`)} · {format.dateTime(new Date(h.resolvedAt), { day: 'numeric', month: 'short' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  // ---------------------------------------------------------------- screens
  let main: ReactNode;

  if (phase.kind === 'unavailable') {
    main = (
      <section data-testid="blind-match-unavailable" className={cn(cardClasses, 'flex flex-col gap-3 p-6')}>
        <h2 className="text-2xl font-extrabold tracking-[-0.01em]">{t('unavailable.title')}</h2>
        <p className="text-[15px] leading-[1.6] text-muted">{t('unavailable.body')}</p>
      </section>
    );
  } else if (phase.kind === 'ineligible') {
    const r = phase.reason;
    main = (
      <>
        <section data-testid={`blind-match-${r}`} className={cn(cardClasses, 'flex flex-col gap-3 p-6')}>
          <h2 className="text-2xl font-extrabold tracking-[-0.01em]">{t(`ineligible.${r}.title`)}</h2>
          <p className="text-[15px] leading-[1.6] text-muted">{t(`ineligible.${r}.body`)}</p>
          <Link href={ineligibleHref[r]} className={buttonClasses('dark', 'md', 'self-start')}>
            {t(`ineligible.${r}.cta`)}
          </Link>
        </section>
        {howItWorks}
      </>
    );
  } else if (phase.kind === 'home') {
    main = (
      <>
        <div className="grid gap-4 sm:grid-cols-2" data-testid="blind-match-start">
          <button
            type="button"
            onClick={onStart}
            disabled={pending}
            className={cn(cardClasses, 'group grid cursor-pointer grid-cols-[auto_1fr] items-center gap-x-4 gap-y-0.5 p-5 text-start sm:flex sm:flex-col sm:items-start sm:gap-3 sm:p-6 transition hover:border-brand hover:shadow-lg focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60')}
          >
            <span aria-hidden="true" className="row-span-2 flex size-12 items-center justify-center rounded-full bg-brand text-ink transition group-hover:scale-105 motion-reduce:transition-none">
              <QrCode className="size-6" strokeWidth={2} />
            </span>
            <span className="text-lg font-extrabold sm:text-xl">{t('start.start')}</span>
            <span className="col-start-2 text-sm leading-normal text-muted">{t('how.s1.body')}</span>
          </button>
          <button
            type="button"
            onClick={() => setPhase({ kind: 'joining' })}
            disabled={pending}
            className={cn(cardClasses, 'group grid cursor-pointer grid-cols-[auto_1fr] items-center gap-x-4 gap-y-0.5 p-5 text-start sm:flex sm:flex-col sm:items-start sm:gap-3 sm:p-6 transition hover:border-brand hover:shadow-lg focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60')}
          >
            <span aria-hidden="true" className="row-span-2 flex size-12 items-center justify-center rounded-full bg-ink text-surface transition group-hover:scale-105 motion-reduce:transition-none">
              <ScanLine className="size-6" strokeWidth={2} />
            </span>
            <span className="text-lg font-extrabold sm:text-xl">{t('start.join')}</span>
            <span className="col-start-2 text-sm leading-normal text-muted">{t('join.title')}</span>
          </button>
        </div>
        {nameToggle}
        {status}
        {howItWorks}
      </>
    );
  } else if (phase.kind === 'joining') {
    main = (
      <section className={cn(cardClasses, 'flex flex-col gap-4 p-[clamp(24px,4vw,36px)]')} data-testid="blind-match-join">
        <h2 className="text-2xl font-extrabold tracking-[-0.01em]">{t('join.title')}</h2>
        {scanning ? (
          <QrScanner
            namespace="blindMatch.scanner"
            onScan={(text) => {
              setScanning(false);
              const code = normaliseCode(text);
              if (!code) return setMessage(t('join.notFound'));
              setCodeInput(formatCode(code));
              onJoin(code); // Scanned: join straight away, no extra tap.
            }}
            onClose={() => setScanning(false)}
            onTypeInstead={() => setScanning(false)}
          />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              onJoin(codeInput);
            }}
          >
            <button type="button" onClick={() => setScanning(true)} className={buttonClasses('dark', 'md', 'self-start')}>
              <ScanLine aria-hidden="true" className="size-5" strokeWidth={2} />
              {t('join.scan')}
            </button>
            <div className="flex flex-col gap-2">
              <label htmlFor="bm-code" className="flex items-center gap-2 text-sm font-bold">
                <KeyRound aria-hidden="true" className="size-4" strokeWidth={2} />
                {t('join.label')}
              </label>
              <div className="flex flex-wrap gap-3">
                <input
                  id="bm-code"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder={t('join.placeholder')}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  dir="ltr"
                  maxLength={12}
                  className="min-h-12 w-full max-w-[16rem] rounded-input border border-line-strong bg-surface px-4 text-center font-mono text-xl tracking-[0.2em] uppercase focus-visible:border-brand focus-visible:outline-none"
                />
                <button
                  type="submit"
                  disabled={pending || !normaliseCode(codeInput)}
                  className={buttonClasses('primary', 'md', 'disabled:opacity-50')}
                >
                  {pending ? t('join.joining') : t('join.submit')}
                </button>
              </div>
            </div>
            {nameToggle}
            <button type="button" onClick={reset} className="min-h-11 self-start text-sm font-bold text-muted underline">
              {t('cancel')}
            </button>
          </form>
        )}
        {status}
      </section>
    );
  } else if (phase.kind === 'code') {
    const mm = Math.floor(secondsLeft / 60);
    const ss = String(secondsLeft % 60).padStart(2, '0');
    main = (
      <section className={cn(cardClasses, 'flex flex-col items-center gap-4 p-[clamp(24px,4vw,36px)] text-center')} data-testid="blind-match-code">
        <h2 className="text-2xl font-extrabold tracking-[-0.01em]">{t('code.title')}</h2>
        {codeExpired ? (
          <>
            <p className="text-[15px] text-muted">{t('code.expired')}</p>
            <button type="button" onClick={onStart} disabled={pending} className={buttonClasses('primary', 'md')}>
              {t('cancelled.again')}
            </button>
          </>
        ) : (
          <>
            <p className="max-w-md text-[15px] leading-[1.6] text-muted">{t('code.body')}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URI, not a remote image */}
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(phase.qrSvg)}`}
              alt={t('code.qrLabel')}
              className="size-[min(240px,70vw)] rounded-tile border border-line bg-white p-2"
            />
            <p dir="ltr" className="font-mono text-3xl font-extrabold tracking-[0.25em]" data-testid="blind-match-code-text">
              {formatCode(phase.code)}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => void copy(phase.code)} className={buttonClasses('ghost', 'sm')}>
                {copied ? <Check aria-hidden="true" className="size-4" strokeWidth={2.5} /> : <Copy aria-hidden="true" className="size-4" strokeWidth={2} />}
                {copied ? t('code.copied') : t('code.copy')}
              </button>
              <button type="button" onClick={() => void share(phase.link)} className={buttonClasses('ghost', 'sm')}>
                {typeof navigator !== 'undefined' && 'share' in navigator ? (
                  <Share2 aria-hidden="true" className="size-4" strokeWidth={2} />
                ) : (
                  <Link2 aria-hidden="true" className="size-4" strokeWidth={2} />
                )}
                {t('code.share')}
              </button>
            </div>
            <p className="text-sm text-muted">
              {t('code.expires')} <span className="font-bold tabular-nums">{t('code.timeLeft', { time: `${mm}:${ss}` })}</span>
            </p>
            <p className="flex items-center gap-2 text-sm font-semibold" role="status" aria-live="polite">
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
              {t('code.waiting')}
            </p>
            <button type="button" onClick={() => act(cancelBlindMatch)} disabled={pending} className="min-h-11 text-sm font-bold text-muted underline">
              {t('cancel')}
            </button>
          </>
        )}
      </section>
    );
  } else if (!state || state.status === 'joined' || state.status === 'waiting') {
    const other = name(state?.otherLabel ?? null);
    const line = !state
      ? null
      : state.meAgreed
        ? t('agree.waitingOther', { name: other })
        : state.otherAgreed
          ? t('agree.otherAgreed', { name: other })
          : state.role === 'starter'
            ? t('agree.waitingJoin', { name: other })
            : null;
    main = (
      <section className={cn(cardClasses, 'flex flex-col gap-5 p-[clamp(24px,4vw,36px)]')} data-testid="blind-match-agree">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-extrabold tracking-[-0.01em]">{t('agree.title')}</h2>
          <p className="text-[15px] text-muted">{t('agree.with', { name: other })}</p>
        </div>
        <div className="rounded-tile bg-bg p-5">{explainerPoints}</div>
        {line ? (
          <p className="flex items-center gap-2 text-[15px] font-semibold" role="status" aria-live="polite">
            {state?.meAgreed ? <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-brand motion-reduce:animate-none" /> : null}
            {line}
          </p>
        ) : null}
        {!state?.meAgreed ? (
          <>
            <label className="flex cursor-pointer items-start gap-3 rounded-tile border border-line-strong p-4 text-[15px] has-[:checked]:border-2 has-[:checked]:border-brand has-[:checked]:bg-brand-tint-soft">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-5 flex-none accent-brand" />
              <span>{t('agree.understand')}</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => act(agreeBlindMatch)}
                disabled={pending || !state || !understood}
                className={buttonClasses('primary', 'md', 'disabled:opacity-50')}
              >
                <Check aria-hidden="true" className="size-5" strokeWidth={2.5} />
                {t('agree.agree')}
              </button>
              <button type="button" onClick={() => act(cancelBlindMatch)} disabled={pending} className={buttonClasses('ghost', 'md')}>
                {t('cancel')}
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => act(cancelBlindMatch)} disabled={pending} className={buttonClasses('ghost', 'md', 'self-start')}>
            {t('cancel')}
          </button>
        )}
        {status}
      </section>
    );
  } else if (state.status === 'cancelled' || state.status === 'gone' || !state.outcome) {
    main = (
      <section className={cn(cardClasses, 'flex flex-col gap-3 p-6')} data-testid="blind-match-cancelled">
        <h2 className="text-2xl font-extrabold tracking-[-0.01em]">{t('cancelled.title')}</h2>
        <p className="text-[15px] leading-[1.6] text-muted">{t('cancelled.body')}</p>
        <button type="button" onClick={reset} className={buttonClasses('dark', 'md', 'self-start')}>
          {t('cancelled.again')}
        </button>
      </section>
    );
  } else if (hidden) {
    main = (
      <section className={cn(cardClasses, 'flex flex-wrap items-center gap-3 p-6')}>
        <EyeOff aria-hidden="true" className="size-5 text-muted" strokeWidth={2} />
        <p className="flex-1 font-semibold">{t('answer.hidden')}</p>
        <button type="button" onClick={() => setHidden(false)} className={buttonClasses('ghost', 'md')}>
          {t('answer.show')}
        </button>
      </section>
    );
  } else {
    const outcome = state.outcome;
    const count = state.screenedCodes.length;
    main = (
      <>
        <section
          className={cn(
            cardClasses,
            'flex animate-fade-up flex-col gap-4 p-[clamp(24px,4vw,36px)] motion-reduce:animate-none',
            outcome === 'shared' && 'border-2 border-brand',
          )}
          data-testid={`blind-match-answer-${outcome}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-[clamp(24px,3vw,30px)] leading-tight font-extrabold tracking-[-0.02em]">{t(`answer.${outcome}.title`)}</h2>
            <button type="button" onClick={() => setHidden(true)} className={buttonClasses('ghost', 'sm')}>
              <EyeOff aria-hidden="true" className="size-4" strokeWidth={2} />
              {t('answer.hide')}
            </button>
          </div>
          <p className="text-[16px] leading-[1.6]">{t(`answer.${outcome}.body`, { count })}</p>
          <p className="flex items-center gap-2 rounded-tile bg-success-tint px-4 py-3 text-sm font-bold text-success-text">
            <Lock aria-hidden="true" className="size-4 flex-none" strokeWidth={2} />
            {t('answer.privateNote')}
          </p>

          <div className="flex flex-wrap gap-3">
            {outcome !== 'none' ? (
              <button type="button" onClick={toCounsellor} disabled={pending} className={buttonClasses('primary', 'md', 'w-full sm:w-auto')}>
                {t('answer.counsellor')}
              </button>
            ) : null}
            {outcome === 'shared' ? (
              <Link href="/dashboard/simulator" className={buttonClasses('ghost', 'md')}>
                {t('answer.meaning')}
              </Link>
            ) : null}
            {count > 0 ? (
              <button type="button" onClick={() => setShowScreened((v) => !v)} aria-expanded={showScreened} className={buttonClasses('ghost', 'md')}>
                {t('answer.seeConditions')}
              </button>
            ) : null}
            <button type="button" onClick={() => setShowNotCovered((v) => !v)} aria-expanded={showNotCovered} className={buttonClasses('ghost', 'md')}>
              {t('answer.notCovered')}
            </button>
          </div>

          {showScreened ? (
            <ul className="flex flex-wrap gap-2" aria-label={t('answer.seeConditions')}>
              {state.screenedCodes.map((c) => (
                <li key={c} className="rounded-full bg-bg px-3 py-1.5 text-sm font-semibold">
                  {conditionName(c)}
                </li>
              ))}
            </ul>
          ) : null}
          {showNotCovered ? <p className="rounded-tile bg-bg p-4 text-sm leading-[1.6]">{t('answer.notCoveredBody')}</p> : null}

          <p className="text-xs text-muted">{t('answer.notCertificate', { count })}</p>
        </section>

        {outcome === 'shared' ? (
          <section className={cn(cardClasses, 'flex flex-col gap-3 p-6')} data-testid="blind-match-reveal">
            {state.revealedCodes ? (
              <>
                <h2 className="text-xl font-extrabold">{t('reveal.title')}</h2>
                <ul className="flex flex-col gap-2">
                  {state.revealedCodes.map((c) => (
                    <li key={c} className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-bg px-4 py-3">
                      <span className="font-extrabold">{conditionName(c)}</span>
                      <Link href={`/dashboard/conditions/${conditionId(c)}`} className="text-sm font-bold text-brand-text underline">
                        {t('reveal.learn')}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/dashboard/couple/consent" className={buttonClasses('ghost', 'md', 'self-start')}>
                  {t('reveal.couple')}
                </Link>
              </>
            ) : state.meRevealed ? (
              <p className="flex items-center gap-2 text-[15px] font-semibold" role="status" aria-live="polite">
                <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
                {t('reveal.waiting')}
              </p>
            ) : (
              <>
                <p className="text-[15px] leading-[1.6] text-muted">{t('reveal.body')}</p>
                <button type="button" onClick={() => act(revealBlindMatch)} disabled={pending} className={buttonClasses('ghost', 'md', 'self-start')}>
                  {t('reveal.ask')}
                </button>
              </>
            )}
          </section>
        ) : null}

        <button type="button" onClick={reset} className={buttonClasses('ghost', 'md', 'self-start')}>
          {t('answer.done')}
        </button>
        {status}
      </>
    );
  }

  return (
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="flex min-w-0 flex-col gap-5">
        {showSteps ? steps : null}
        {/* On phones, only once someone has joined: the QR code comes first. */}
        {peopleCard && phase.kind === 'session' ? <div className="lg:hidden">{peopleCard}</div> : null}
        {main}
      </div>
      <aside className="flex min-w-0 flex-col gap-5">
        {peopleCard ? <div className="hidden lg:block">{peopleCard}</div> : null}
        {historyCard}
      </aside>
    </div>
  );
}
