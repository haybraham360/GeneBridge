'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { signOut } from '@/lib/auth/actions';
import { cn } from '@/lib/cn';

/**
 * Sign out (task 11 section 7), the same full-width button in every side
 * menu. Clears this tab's session storage (assistant conversation and
 * toggles, message drafts, check-in) before the session ends, then lands
 * on the home page with a short "You've signed out." No confirmation.
 */
export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations('common');
  return (
    <form
      action={signOut}
      onSubmit={() => {
        try {
          window.sessionStorage.clear();
        } catch {
          // Storage can be unavailable (private mode); signing out still works.
        }
      }}
      className={className}
    >
      <button
        type="submit"
        className={cn(
          'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-sm font-bold text-ink transition-colors hover:bg-brand-tint-soft',
        )}
      >
        <LogOut aria-hidden="true" className="size-4 rtl:-scale-x-100" strokeWidth={2} />
        {t('signOut')}
      </button>
    </form>
  );
}
