'use client';

import { InviteStep } from '@/app/[locale]/(app)/onboarding/components/InviteStep';

/** The onboarding partner invite (task 04), reused on the couple consent page. */
export function InvitePartner() {
  return <InviteStep onInvited={() => {}} />;
}
