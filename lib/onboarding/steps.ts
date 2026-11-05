/**
 * Onboarding step rules (task 04), shared by the page, the server actions and
 * the client flow. Pure functions only, so they can be unit-tested.
 */

export const TOTAL_STEPS = 8;

export const steps = [
  'welcome',
  'language',
  'learn',
  'reason',
  'privacy',
  'connect',
  'invite',
  'done',
] as const;

export type StepKey = (typeof steps)[number];
export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const PRIVACY_STEP = 5;
export const INVITE_STEP = 7;
export const DONE_STEP = 8;

export function stepKey(step: StepNumber): StepKey {
  return steps[step - 1];
}

export function isStepNumber(value: unknown): value is StepNumber {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= TOTAL_STEPS;
}

/**
 * Skip is offered on every step except welcome (everyone must say whether
 * they're a patient or a health professional), privacy and the final step.
 */
export function canSkip(step: StepNumber): boolean {
  return step !== 1 && step !== PRIVACY_STEP && step !== DONE_STEP;
}

/** `profiles.onboarding_step` holds the step to resume on; 0 means not started. */
export function resumeStep(stored: number | null | undefined): StepNumber {
  if (!stored || stored < 1) return 1;
  return Math.min(stored, TOTAL_STEPS) as StepNumber;
}

type Flow = {
  /** True when the person is already linked to a partner (e.g. they arrived by invite). */
  skipInvite: boolean;
};

export function nextStep(step: StepNumber, { skipInvite }: Flow): StepNumber {
  const next = Math.min(step + 1, TOTAL_STEPS) as StepNumber;
  return next === INVITE_STEP && skipInvite ? DONE_STEP : next;
}

export function previousStep(step: StepNumber, { skipInvite }: Flow): StepNumber {
  const prev = Math.max(step - 1, 1) as StepNumber;
  return prev === INVITE_STEP && skipInvite ? ((INVITE_STEP - 1) as StepNumber) : prev;
}

export function progressPercent(step: StepNumber): number {
  return Math.round((step / TOTAL_STEPS) * 100);
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * Step 1. Who is signing up. "professional" never sets a role by itself: the
 * counsellor role is granted only after the server checks a facility code.
 */
export const accountTypes = ['individual', 'professional'] as const;
export type AccountType = (typeof accountTypes)[number];

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (accountTypes as readonly string[]).includes(value);
}

/** Step 2. Urdu, Hindi and Tagalog show English text until translated. */
export const languageChoices = ['ar', 'en', 'ur', 'hi', 'tl'] as const;
export type LanguageChoice = (typeof languageChoices)[number];

export function isLanguageChoice(value: unknown): value is LanguageChoice {
  return typeof value === 'string' && (languageChoices as readonly string[]).includes(value);
}

/** The app locale (and so the text direction) a language choice switches to. */
export function uiLocaleFor(choice: string | null | undefined): 'ar' | 'en' {
  return choice === 'ar' ? 'ar' : 'en';
}

export function isFullyTranslated(choice: LanguageChoice): boolean {
  return choice === 'ar' || choice === 'en';
}

/** Step 3. */
export const learningModes = ['read', 'listen', 'read_listen'] as const;
export type LearningMode = (typeof learningModes)[number];

export function isLearningMode(value: unknown): value is LearningMode {
  return typeof value === 'string' && (learningModes as readonly string[]).includes(value);
}

/** Steps are read aloud automatically for these modes. */
export function autoListens(mode: LearningMode | null): boolean {
  return mode === 'listen' || mode === 'read_listen';
}

/** Step 4. Skipping it counts as "I'm just learning". */
export const reasons = ['premarital_result', 'family_condition', 'just_learning'] as const;
export type Reason = (typeof reasons)[number];
export const DEFAULT_REASON: Reason = 'just_learning';

export function isReason(value: unknown): value is Reason {
  return typeof value === 'string' && (reasons as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Step 6: reference numbers
// ---------------------------------------------------------------------------

/** Upper-cases and tidies a typed or scanned reference. Null if it can't be one. */
export function normaliseReference(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase().replace(/\s+/g, '').replace(/[‐-―−]/g, '-');
  return /^[A-Z0-9][A-Z0-9-]{4,39}$/.test(code) ? code : null;
}

/**
 * Pulls a reference number out of a scanned QR code. Reports may encode the
 * bare number or a link that contains it.
 */
export function referenceFromQr(text: string): string | null {
  const match = text.toUpperCase().match(/[A-Z]{2}-[A-Z]{2,5}-\d{4}-\d{4,8}/);
  if (match) return match[0];
  return normaliseReference(text);
}

// ---------------------------------------------------------------------------
// Step 8
// ---------------------------------------------------------------------------

// Results and counsellor live under the dashboard (feat(dashboard)).
export type FinishDestination = '/dashboard/results' | '/dashboard/counsellor' | '/dashboard';

/**
 * Where "You're all set" leads. A flagged result goes straight to the
 * counsellor and never to the explainer (guardrail 4).
 */
export function finishDestination(result: { connected: boolean; flagged: boolean }): FinishDestination {
  if (!result.connected) return '/dashboard';
  return result.flagged ? '/dashboard/counsellor' : '/dashboard/results';
}
