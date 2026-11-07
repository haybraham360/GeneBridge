import type { LanguageChoice, LearningMode, StepNumber } from './steps';

/**
 * Onboarding analytics events (task 04, section 8). Only these, and never
 * personal details: no reference codes, names, phone numbers or answers about
 * a result.
 */
export type InviteChannel = 'whatsapp' | 'sms' | 'copy';

export type OnboardingEvent =
  | { name: 'onboarding_step_completed'; props: { step: StepNumber; skipped: boolean } }
  | { name: 'onboarding_language_set'; props: { locale: LanguageChoice } }
  | { name: 'onboarding_learning_mode_set'; props: { mode: LearningMode } }
  | { name: 'result_claimed'; props?: undefined }
  | { name: 'partner_invite_created'; props: { channel: InviteChannel } }
  | { name: 'partner_invite_accepted'; props?: undefined }
  | { name: 'onboarding_completed'; props: { seconds: number } }
  // Task 11: personalised paths. Condition ids and reasons only.
  | { name: 'user_path_set'; props: { path: 'result' | 'exploring' } }
  | { name: 'condition_followed'; props: { condition: string; reason: 'family_history' | 'think_i_have' | 'learning' } }
  | { name: 'condition_unfollowed'; props: Record<string, never> };

export function isInviteChannel(value: unknown): value is InviteChannel {
  return value === 'whatsapp' || value === 'sms' || value === 'copy';
}
