import 'server-only';
/**
 * Optional third-party identity verification (task 14, section 5): ID
 * authenticity and a selfie-to-ID face match. Off unless KYC_PROVIDER is set.
 * Without one, admins compare the selfie with the ID photo themselves.
 *
 * To add a provider: implement KycProvider in this file (or a sibling) and
 * return it from kycProvider() for its KYC_PROVIDER name. Send it only the
 * images it needs, never the licence, and never store its raw response:
 * keep only the passed / failed / unclear outcome in ai_precheck.provider.
 */
import type { CheckResult } from './types';

export type ProviderInput = {
  idFront: Buffer;
  idBack: Buffer | null;
  selfie: Buffer | null;
};

export type ProviderResult = { name: string; id_authentic: CheckResult; face_match: CheckResult };

export interface KycProvider {
  readonly name: string;
  verify(input: ProviderInput, signal?: AbortSignal): Promise<ProviderResult>;
}

export function kycProvider(): KycProvider | null {
  const name = process.env.KYC_PROVIDER?.trim();
  if (!name) return null;
  // No provider is integrated yet. An unknown name is logged and ignored, so
  // a typo never blocks submissions; admins review manually instead.
  console.warn(`KYC_PROVIDER "${name}" is not implemented; falling back to manual review.`);
  return null;
}
