import type { AccountType, LanguageChoice, LearningMode, StepNumber } from './steps';

/**
 * Onboarding analytics events (task 04, section 8). Only these, and never
 * personal details: no reference codes, names, phone numbers or answers about
 * a result.
 */
export type InviteChannel = 'whatsapp' | 'sms' | 'copy';

export type OnboardingEvent =
  | { name: 'onboarding_step_completed'; props: { step: StepNumber; skipped: boolean } }
  | { name: 'onboarding_account_type_set'; props: { type: AccountType } }
  /** A wrong facility code on the welcome step. Counted to slow down guessing. */
  | { name: 'facility_code_failed'; props?: undefined }
  | { name: 'onboarding_language_set'; props: { locale: LanguageChoice } }
  | { name: 'onboarding_learning_mode_set'; props: { mode: LearningMode } }
  | { name: 'result_claimed'; props?: undefined }
  | { name: 'partner_invite_created'; props: { channel: InviteChannel } }
  | { name: 'partner_invite_accepted'; props?: undefined }
  | { name: 'onboarding_completed'; props: { seconds: number } };

export function isInviteChannel(value: unknown): value is InviteChannel {
  return value === 'whatsapp' || value === 'sms' || value === 'copy';
}
