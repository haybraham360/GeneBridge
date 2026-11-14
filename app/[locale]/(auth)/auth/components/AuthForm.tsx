'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, buttonClasses } from '@/components/ui/Button';
import { OptionCards } from '@/components/ui/OptionCards';
import { Link, useRouter } from '@/i18n/navigation';
import { completeAuth, demoSignIn, guestSignIn, prepareAuth, uaePassSignIn } from '@/lib/auth/actions';
import type { DemoAccount } from '@/lib/auth/uaePass';
import type { FinishResult } from '@/lib/auth/complete';
import { isRateLimited, sendErrorKey, verifyErrorKey, type AuthErrorKey } from '@/lib/auth/errors';
import { createClient } from '@/lib/supabase/browser';
import { cn } from '@/lib/cn';
import { AuthTabs, panelId, tabId, type AuthMode } from './AuthTabs';
import { CODE_LENGTH, CodeInput, type CodeInputHandle } from './CodeInput';
import { DemoAccounts } from './DemoAccounts';
import { Divider } from './Divider';
import { FieldError } from './FieldError';
import { PasswordField } from './PasswordField';
import { inputClasses, labelClasses, linkButtonClasses } from './styles';
import { UaePassDialog, type UaePassIdentityKey } from './UaePassDialog';

type View = 'start' | 'code' | 'emailSent' | 'consent';
type Method = 'phone' | 'email';
type Field = 'phone' | 'email' | 'password' | 'consent' | 'code';
/** "How will you use GeneBridge?" (task 14). The server never accepts any other value. */
type AccountType = 'individual' | 'professional';
const accountTypes: AccountType[] = ['individual', 'professional'];
type Errors = Partial<Record<Field | 'uaePass' | 'google' | 'guest' | 'demo', string>>;

const RESEND_SECONDS = 30;
const emptyCode = () => Array<string>(CODE_LENGTH).fill('');

/** UAE mobile numbers: 9 digits starting with 5, typed with or without 0 / 971. */
function nationalDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('971')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}
const isUaeMobile = (digits: string) => /^5\d{8}$/.test(digits);
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** "+971 50 123 4567", wrapped in an LTR isolate so it reads correctly in Arabic. */
const displayPhone = (digits: string) =>
  `⁦+971 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}⁩`;
const isolate = (text: string) => `⁨${text}⁩`;

export function AuthForm({
  next,
  idle,
  callbackError,
  uaePassEnabled,
  demoEnabled,
  googleEnabled,
  phoneEnabled,
  guestEnabled,
  initialView = 'start',
}: {
  next: string | null;
  idle: boolean;
  /** Set when the email link or Google sign-in came back with an error. */
  callbackError: 'link' | 'google' | null;
  uaePassEnabled: boolean;
  /** "Try the prototype" one-click demo accounts (demo mode only). */
  demoEnabled: boolean;
  googleEnabled: boolean;
  /** Phone code sign-in. Off until an SMS setup is ready (PHONE_AUTH_ENABLED). */
  phoneEnabled: boolean;
  /** "Continue as a guest" (anonymous sign-in on in Supabase). */
  guestEnabled: boolean;
  initialView?: 'start' | 'consent';
}) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [mode, setMode] = useState<AuthMode>('signup');
  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [view, setView] = useState<View>(initialView);
  const [method, setMethod] = useState<Method>(phoneEnabled ? 'phone' : 'email');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState<string[]>(emptyCode);
  const [errors, setErrors] = useState<Errors>(
    callbackError === 'link'
      ? { email: t('errors.linkInvalid') }
      : callbackError === 'google'
        ? { google: t('google.failed') }
        : {},
  );
  const [status, setStatus] = useState(idle ? t('idle') : '');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [uaePassOpen, setUaePassOpen] = useState(false);
  const [demoPending, setDemoPending] = useState<DemoAccount | null>(null);
  /** Bumped each time the consent box is missed, to replay its nudge. */
  const [consentNudge, setConsentNudge] = useState(0);

  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<CodeInputHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const isSignup = mode === 'signup';
  // Passwords are for returning users: sign-up is by email link, then the
  // person can set a password (/auth/password).
  const passwordMode = usePassword && !isSignup && method === 'email';
  const digits = nationalDigits(phone);

  // Resend countdown on the code step.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // Move focus to the start of each new step.
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    if (view === 'code') codeRef.current?.focus();
    else headingRef.current?.focus();
  }, [view]);

  /** Shows errors and moves focus to the first one, in on-screen order. */
  const fail = (next: Errors) => {
    setErrors(next);
    const order: Field[] = ['consent', 'phone', 'email', 'password', 'code'];
    const first = order.find((f) => next[f]);
    if (next.consent) setConsentNudge((n) => n + 1);
    requestAnimationFrame(() => {
      if (first === 'code') codeRef.current?.focus();
      else if (first === 'consent') {
        // If the person has scrolled down to a sign-in option, bring the whole
        // box (and its message) back into view, then focus it.
        const box = consentRef.current?.closest('label');
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        box?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        consentRef.current?.focus({ preventScroll: true });
      }
      else if (first) {
        const refs = {
          phone: phoneRef,
          email: emailRef,
          password: passwordRef,
          consent: consentRef,
        };
        refs[first].current?.focus();
      }
    });
  };

  const errorText = (key: AuthErrorKey) => t(`errors.${key}`);

  const finish = (result: FinishResult | { status: 'error' }) => {
    if (result.status === 'done') {
      router.replace(result.redirectTo);
      router.refresh();
      return;
    }
    setBusy(false);
    if (result.status === 'needsConsent') {
      setErrors({});
      setView('consent');
    } else {
      setErrors({ code: errorText('generic') });
    }
  };

  /** Shared checks before any code or link is sent. */
  const validateStart = (field: 'phone' | 'email'): Errors => {
    const found: Errors = {};
    if (field === 'phone' && !isUaeMobile(digits)) found.phone = t('phone.invalid');
    if (field === 'email' && !isEmail(email)) found.email = t('email.invalid');
    if (isSignup && !consent) found.consent = t('consent.required');
    return found;
  };

  const prepare = async (m: Method | 'password'): Promise<boolean> => {
    const prepared = await prepareAuth({
      mode,
      method: m,
      consent: isSignup && consent,
      accountType: isSignup ? accountType : undefined,
      next,
    });
    if (prepared.ok) return true;
    fail({ consent: t('consent.required') });
    return false;
  };

  const sendPhoneCode = async (resend = false) => {
    if (!resend) {
      const found = validateStart('phone');
      if (Object.keys(found).length) return fail(found);
    }
    setBusy(true);
    setErrors({});
    try {
      if (!resend && !(await prepare('phone'))) return;
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+971${digits}`,
        options: { shouldCreateUser: true, data: { locale } },
      });
      if (error) {
        fail(
          resend
            ? { code: errorText(sendErrorKey(error, 'phone')) }
            : { phone: errorText(sendErrorKey(error, 'phone')) },
        );
        return;
      }
      setCode(emptyCode());
      setResendIn(RESEND_SECONDS);
      setStatus(resend ? t('code.resent') : t('code.sent'));
      if (resend) codeRef.current?.focus();
      else setView('code');
    } catch {
      fail(resend ? { code: errorText('generic') } : { phone: errorText('generic') });
    } finally {
      setBusy(false);
    }
  };

  const sendEmailLink = async () => {
    const found = validateStart('email');
    if (Object.keys(found).length) return fail(found);
    setBusy(true);
    setErrors({});
    try {
      if (!(await prepare('email'))) return;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          data: { locale },
          emailRedirectTo: `${window.location.origin}/${locale}/auth/callback`,
        },
      });
      if (error) return fail({ email: errorText(sendErrorKey(error, 'email')) });
      setStatus(t('emailSent.status'));
      setView('emailSent');
    } catch {
      fail({ email: errorText('generic') });
    } finally {
      setBusy(false);
    }
  };

  /** Returning users who set a password. Never says whether the email exists. */
  const signInWithPassword = async () => {
    const found = validateStart('email');
    if (!password) found.password = t('password.required');
    if (Object.keys(found).length) return fail(found);
    setBusy(true);
    setErrors({});
    try {
      if (!(await prepare('password'))) return setBusy(false);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setBusy(false);
        setPassword('');
        return fail({
          password: isRateLimited(error) ? errorText('tooMany') : t('password.invalid'),
        });
      }
      finish(await completeAuth());
    } catch {
      setBusy(false);
      fail({ password: errorText('generic') });
    }
  };

  const verifyCode = async (value = code.join('')) => {
    if (busy) return;
    if (value.length !== CODE_LENGTH) return fail({ code: t('code.incomplete') });
    setBusy(true);
    setErrors({});
    setStatus(t('code.verifying'));
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: `+971${digits}`,
        token: value,
        type: 'sms',
      });
      if (error) {
        setBusy(false);
        setStatus('');
        setCode(emptyCode());
        return fail({ code: errorText(verifyErrorKey(error)) });
      }
      finish(await completeAuth());
    } catch {
      setBusy(false);
      setStatus('');
      fail({ code: errorText('generic') });
    }
  };

  const giveConsent = async () => {
    if (!consent) return fail({ consent: t('consent.required') });
    setBusy(true);
    try {
      finish(await completeAuth({ consent: true }));
    } catch {
      setBusy(false);
      fail({ consent: errorText('generic') });
    }
  };

  const signInWithGoogle = async () => {
    if (isSignup && !consent) return fail({ consent: t('consent.required') });
    setBusy(true);
    setErrors({});
    try {
      const prepared = await prepareAuth({
        mode,
        method: 'google',
        consent: isSignup && consent,
        accountType: isSignup ? accountType : undefined,
        next,
      });
      if (!prepared.ok) {
        setBusy(false);
        return fail({ consent: t('consent.required') });
      }
      // Leaves the page for Google, then returns to /auth/callback.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/${locale}/auth/callback` },
      });
      if (error) {
        setBusy(false);
        setErrors({ google: t('google.failed') });
      }
    } catch {
      setBusy(false);
      setErrors({ google: t('google.failed') });
    }
  };

  /** No phone or email: an anonymous account that still gives consent. */
  const continueAsGuest = async () => {
    if (isSignup && !consent) return fail({ consent: t('consent.required') });
    setBusy(true);
    setErrors({});
    try {
      const result = await guestSignIn({ mode, consent: isSignup && consent, next });
      if (result.status === 'error') {
        setBusy(false);
        setErrors({ guest: t('guest.failed') });
        return;
      }
      finish(result);
    } catch {
      setBusy(false);
      setErrors({ guest: t('guest.failed') });
    }
  };

  /** One click, no password: a seeded synthetic account (demo mode only). */
  const signInToDemo = async (account: DemoAccount) => {
    setBusy(true);
    setDemoPending(account);
    setErrors({});
    try {
      const result = await demoSignIn({ account, next });
      if (result.status === 'done') return finish(result);
      setBusy(false);
      setDemoPending(null);
      setErrors({ demo: t('demo.failed') });
    } catch {
      setBusy(false);
      setDemoPending(null);
      setErrors({ demo: t('demo.failed') });
    }
  };

  const openUaePass = () => {
    if (isSignup && !consent) return fail({ consent: t('consent.required') });
    setErrors({});
    setUaePassOpen(true);
  };

  const chooseUaePass = async (identity: UaePassIdentityKey) => {
    setBusy(true);
    setErrors({});
    try {
      const result = await uaePassSignIn({
        identity,
        mode,
        consent: isSignup && consent,
        accountType: isSignup ? accountType : undefined,
        next,
      });
      if (result.status === 'error') {
        setBusy(false);
        setErrors({ uaePass: t('uaePass.failed') });
        return;
      }
      if (result.status === 'needsConsent') setUaePassOpen(false);
      finish(result);
    } catch {
      setBusy(false);
      setErrors({ uaePass: t('uaePass.failed') });
    }
  };

  const changeMode = (m: AuthMode) => {
    setMode(m);
    setErrors({});
  };

  const backToStart = () => {
    setView('start');
    setErrors({});
    setStatus('');
    setCode(emptyCode());
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (view === 'code') void verifyCode();
    else if (view === 'consent') void giveConsent();
    else if (method === 'phone') void sendPhoneCode();
    else if (passwordMode) void signInWithPassword();
    else void sendEmailLink();
  };

  const describe = (field: Field) => (errors[field] ? `${field}-error` : undefined);

  // ----- Pieces -----------------------------------------------------------

  const heading = (title: string, subline?: string) => (
    <div className="flex flex-col gap-2">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-[clamp(30px,4vw,36px)] leading-[1.1] font-extrabold tracking-[-0.02em] outline-none"
      >
        {title}
      </h1>
      {subline ? <p className="text-base text-muted">{subline}</p> : null}
    </div>
  );

  const accountTypeField = (
    <div className="flex flex-col gap-3">
      <p id="account-type-question" className={labelClasses}>
        {t('accountType.question')}
      </p>
      <OptionCards
        options={accountTypes.map((type) => ({
          value: type,
          label: t(`accountType.${type}.label`),
          sub: t(`accountType.${type}.sub`),
        }))}
        value={accountType}
        onChange={setAccountType}
        onSubmit={() => consentRef.current?.focus()}
        labelledBy="account-type-question"
        disabled={busy}
      />
    </div>
  );

  const consentField = (
    <div className="flex scroll-my-24 flex-col gap-2">
      <label
        // A new key replays the nudge each time the box is missed.
        key={consentNudge}
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-tile border p-4 text-sm leading-[1.5] transition-[background-color,border-color,box-shadow] duration-200',
          errors.consent
            ? 'border-danger bg-brand-tint-soft shadow-[0_0_0_4px_rgba(185,28,28,0.12)] motion-safe:animate-nudge'
            : consent
              ? 'border-ink bg-surface'
              : 'border-line bg-surface hover:border-line-strong',
        )}
      >
        <input
          ref={consentRef}
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked) setErrors((prev) => ({ ...prev, consent: undefined }));
          }}
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={describe('consent')}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-ink"
        />
        <span>
          {t('consent.text')}{' '}
          <Link
            href="/privacy"
            className="font-semibold text-brand-text underline hover:text-brand-text-dark"
          >
            {t('consent.link')}
          </Link>
        </span>
      </label>
      <FieldError id="consent-error" message={errors.consent} />
    </div>
  );

  const phoneField = (
    <div className="flex flex-col gap-2">
      <label htmlFor="phone" className={labelClasses}>
        {t('phone.label')}
      </label>
      {/* The country code and number always read left to right. */}
      <div dir="ltr" className="flex gap-2">
        <span
          aria-label={t('phone.prefixLabel')}
          className="flex min-h-[52px] items-center rounded-input border border-line-strong bg-surface px-4 font-semibold"
        >
          {t('phone.prefix')}
        </span>
        <input
          ref={phoneRef}
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={t('phone.placeholder')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={describe('phone')}
          className={inputClasses}
        />
      </div>
      <FieldError id="phone-error" message={errors.phone} />
    </div>
  );

  const emailField = (
    <div className="flex flex-col gap-2">
      <label htmlFor="email" className={labelClasses}>
        {t('email.label')}
      </label>
      <input
        ref={emailRef}
        id="email"
        name="email"
        type="email"
        dir="ltr"
        autoComplete="email"
        placeholder={t('email.placeholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={Boolean(errors.email)}
        aria-describedby={describe('email')}
        className={cn(inputClasses, 'text-start rtl:text-right')}
      />
      <FieldError id="email-error" message={errors.email} />
    </div>
  );

  const submitLabel = passwordMode
    ? t(busy ? 'password.signingIn' : 'password.signIn')
    : busy
      ? t(method === 'phone' ? 'phone.sending' : 'email.sending')
      : t(method === 'phone' ? 'phone.send' : 'email.send');

  const methodFields = (
    <>
      {method === 'phone' ? phoneField : emailField}
      {passwordMode ? (
        <PasswordField
          ref={passwordRef}
          id="password"
          label={t('password.label')}
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          autoComplete="current-password"
          error={errors.password}
        />
      ) : null}
      <Button
        type="submit"
        variant="primary"
        disabled={busy}
        className="min-h-[52px] w-full disabled:cursor-wait disabled:opacity-70"
      >
        {submitLabel}
      </Button>
      {method === 'email' && !isSignup ? (
        <button
          type="button"
          onClick={() => {
            setUsePassword(!usePassword);
            setPassword('');
            setErrors({});
          }}
          className={cn(linkButtonClasses, 'self-center')}
        >
          {usePassword ? t('password.useLink') : t('password.usePassword')}
        </button>
      ) : null}
      {phoneEnabled ? (
        <button
          type="button"
          onClick={() => {
            setMethod(method === 'phone' ? 'email' : 'phone');
            setErrors({});
          }}
          className={cn(linkButtonClasses, 'self-center')}
        >
          {method === 'phone' ? t('switchToEmail') : t('switchToPhone')}
        </button>
      ) : null}
    </>
  );

  // ----- Views ------------------------------------------------------------

  let body;
  if (view === 'consent') {
    body = (
      <>
        {heading(t('consent.stepHeading'), t('consent.stepBody'))}
        {consentField}
        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          className="min-h-[52px] w-full disabled:opacity-70"
        >
          {t('consent.continue')}
        </Button>
      </>
    );
  } else if (view === 'code') {
    body = (
      <>
        {heading(t('code.heading'), t('code.body', { phone: displayPhone(digits) }))}
        <CodeInput
          ref={codeRef}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (errors.code) setErrors({});
          }}
          onComplete={(v) => void verifyCode(v)}
          invalid={Boolean(errors.code)}
          describedBy={describe('code')}
          disabled={busy}
        />
        <FieldError id="code-error" message={errors.code} />
        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          className="min-h-[52px] w-full disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? t('code.verifying') : t('code.verify')}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={backToStart} className={linkButtonClasses}>
            {t('code.change')}
          </button>
          <button
            type="button"
            onClick={() => void sendPhoneCode(true)}
            disabled={resendIn > 0 || busy}
            className={linkButtonClasses}
          >
            {resendIn > 0 ? t('code.resendIn', { seconds: resendIn }) : t('code.resend')}
          </button>
        </div>
      </>
    );
  } else if (view === 'emailSent') {
    body = (
      <>
        {heading(t('emailSent.heading'))}
        <p className="text-base leading-[1.6] text-muted">
          {t('emailSent.body', { email: isolate(email.trim()) })}
        </p>
        <button
          type="button"
          onClick={() => {
            backToStart();
            setMethod('email');
            setEmail('');
          }}
          className={cn(linkButtonClasses, 'self-start')}
        >
          {t('emailSent.different')}
        </button>
      </>
    );
  } else {
    body = (
      <>
        {demoEnabled ? (
          <>
            <DemoAccounts
              busy={busy}
              pending={demoPending}
              error={errors.demo}
              onChoose={(account) => void signInToDemo(account)}
            />
            <Divider>{t('guest.divider')}</Divider>
          </>
        ) : null}
        <AuthTabs mode={mode} onChange={changeMode} />
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(mode)}
          className="flex flex-col gap-5"
        >
          {heading(t(`${mode}.heading`), t(`${mode}.subline`))}
          {/* Who the account is for, then agree, then choose how to continue. */}
          {isSignup ? accountTypeField : null}
          {isSignup ? consentField : null}
          {uaePassEnabled || googleEnabled ? (
            <>
              {uaePassEnabled ? (
                <button
                  type="button"
                  onClick={openUaePass}
                  className={buttonClasses('ghost', 'md', 'min-h-[52px] w-full')}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-6 items-center justify-center rounded-md bg-ink text-[10px] font-extrabold text-white"
                  >
                    {t('uaePass.badge')}
                  </span>
                  {t('uaePass.button')}
                </button>
              ) : null}
              {googleEnabled ? (
                <>
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    disabled={busy}
                    className={buttonClasses(
                      'ghost',
                      'md',
                      'min-h-[52px] w-full disabled:cursor-wait disabled:opacity-70',
                    )}
                  >
                    {t('google.button')}
                  </button>
                  <FieldError id="google-error" message={errors.google} />
                </>
              ) : null}
              <Divider>{t(method === 'phone' ? 'divider.phone' : 'divider.email')}</Divider>
            </>
          ) : null}
          {methodFields}
          {guestEnabled ? (
            <>
              <Divider>{t('guest.divider')}</Divider>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void continueAsGuest()}
                  disabled={busy}
                  aria-describedby="guest-hint"
                  className={buttonClasses(
                    'ghost',
                    'md',
                    'min-h-[52px] w-full disabled:cursor-wait disabled:opacity-70',
                  )}
                >
                  {t('guest.button')}
                </button>
                <p id="guest-hint" className="text-center text-[13px] leading-[1.5] text-muted">
                  {t('guest.hint')}
                </p>
                <FieldError id="guest-error" message={errors.guest} />
              </div>
            </>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      {idle && view === 'start' ? (
        <p className="rounded-tile bg-info-tint px-4 py-3 text-sm font-semibold text-info-text">
          {t('idle')}
        </p>
      ) : null}
      <form
        noValidate
        onSubmit={onSubmit}
        // Re-run the entrance on each step so changes feel connected.
        key={view}
        className="flex flex-col gap-5 motion-safe:animate-fade-up"
      >
        {body}
      </form>
      {/* Announces status changes such as "Code sent". */}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      {uaePassEnabled ? (
        <UaePassDialog
          open={uaePassOpen}
          busy={busy}
          error={errors.uaePass}
          onClose={() => {
            if (!busy) setUaePassOpen(false);
          }}
          onChoose={(identity) => void chooseUaePass(identity)}
        />
      ) : null}
    </>
  );
}
