'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localeDirection } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export type AuthMode = 'signup' | 'signin';

const modes: AuthMode[] = ['signup', 'signin'];

export const tabId = (mode: AuthMode) => `auth-tab-${mode}`;
export const panelId = 'auth-panel';

/**
 * "Create account" / "Sign in" tab list. Automatic activation, roving
 * tabindex, Arrow keys (mirrored in RTL), Home and End.
 */
export function AuthTabs({
  mode,
  onChange,
}: {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
}) {
  const t = useTranslations('auth.tabs');
  const rtl = localeDirection[useLocale()] === 'rtl';
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const next = modes[(index + modes.length) % modes.length];
    onChange(next);
    refs.current[modes.indexOf(next)]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward) select(index + 1);
    else if (event.key === back) select(index - 1);
    else if (event.key === 'Home') select(0);
    else if (event.key === 'End') select(modes.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div role="tablist" aria-label={t('label')} className="flex rounded-full bg-[#F6E9DF] p-1">
      {modes.map((m, i) => {
        const selected = m === mode;
        return (
          <button
            key={m}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(m)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(m)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'min-h-11 flex-1 cursor-pointer rounded-full text-sm font-bold transition-colors duration-200',
              selected ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white/60',
            )}
          >
            {t(m)}
          </button>
        );
      })}
    </div>
  );
}
