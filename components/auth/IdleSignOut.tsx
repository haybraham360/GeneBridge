'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { IDLE_LIMIT_MS, IDLE_REASON, LAST_ACTIVE_COOKIE } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/browser';

const COOKIE_WRITE_EVERY_MS = 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;

/**
 * Signs the person out after 30 minutes without activity, then shows the
 * "signed out to keep your information private" notice on /auth.
 *
 * On-page activity also refreshes the last-active cookie the proxy reads, so
 * someone reading a long page isn't signed out on their next click.
 */
export function IdleSignOut() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let lastActive = Date.now();
    let lastWrite = 0;

    const touch = () => {
      lastActive = Date.now();
      if (lastActive - lastWrite > COOKIE_WRITE_EVERY_MS) {
        lastWrite = lastActive;
        const secure = location.protocol === 'https:' ? '; secure' : '';
        document.cookie = `${LAST_ACTIVE_COOKIE}=${lastActive}; path=/; samesite=lax${secure}`;
      }
    };

    const check = async () => {
      if (Date.now() - lastActive < IDLE_LIMIT_MS) return;
      window.clearInterval(timer);
      await createClient().auth.signOut();
      router.replace({ pathname: '/auth', query: { reason: IDLE_REASON, next: pathname } });
      router.refresh();
    };

    const activity = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const;
    activity.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    touch();

    return () => {
      activity.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, [pathname, router]);

  return null;
}
