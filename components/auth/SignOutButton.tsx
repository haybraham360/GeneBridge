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
export function SignOutButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useTranslations('common');
  const label = t('signOut');
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
      {compact ? (
        // Icon only (patient side menu): still 44px and named "Sign out".
        <button
          type="submit"
          aria-label={label}
          title={label}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-brand-tint-soft hover:text-ink"
        >
          <LogOut aria-hidden="true" className="size-4.5 rtl:-scale-x-100" strokeWidth={2} />
        </button>
      ) : (
      <button
        type="submit"
        className={cn(
          'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-sm font-bold text-ink transition-colors hover:bg-brand-tint-soft',
        )}
      >
        <LogOut aria-hidden="true" className="size-4 rtl:-scale-x-100" strokeWidth={2} />
        {label}
      </button>
      )}
    </form>
  );
}
