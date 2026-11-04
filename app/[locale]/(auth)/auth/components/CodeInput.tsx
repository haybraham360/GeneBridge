'use client';

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export const CODE_LENGTH = 6;

export type CodeInputHandle = { focus: () => void };

type Props = {
  value: string[];
  onChange: (value: string[]) => void;
  /** Called once all boxes are filled. */
  onComplete: (code: string) => void;
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
};

/**
 * Six single-digit boxes with auto-advance, backspace-to-previous and paste.
 * Codes are read left to right in every language, so the group is pinned LTR.
 */
export const CodeInput = forwardRef<CodeInputHandle, Props>(function CodeInput(
  { value, onChange, onComplete, invalid, describedBy, disabled },
  ref,
) {
  const t = useTranslations('auth.code');
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useImperativeHandle(ref, () => ({
    focus: () =>
      boxes.current[
        Math.max(
          0,
          value.findIndex((d) => !d),
        )
      ]?.focus() ?? boxes.current[0]?.focus(),
  }));

  const fill = (start: number, digits: string) => {
    const next = [...value];
    let index = start;
    for (const d of digits) {
      if (index >= CODE_LENGTH) break;
      next[index++] = d;
    }
    onChange(next);
    boxes.current[Math.min(index, CODE_LENGTH - 1)]?.focus();
    if (next.every(Boolean)) onComplete(next.join(''));
  };

  const onInput = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      const next = [...value];
      next[index] = '';
      onChange(next);
      return;
    }
    // One digit typed, or SMS autofill dropping the whole code into the first
    // box (which allows 6 characters). Typing into a filled first box gives
    // two characters: keep the new one.
    fill(index, digits.length === 2 && value[index] ? digits.slice(-1) : digits);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      event.preventDefault();
      const next = [...value];
      next[index - 1] = '';
      onChange(next);
      boxes.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      boxes.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      boxes.current[index + 1]?.focus();
    }
  };

  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    event.preventDefault();
    fill(index, digits);
  };

  return (
    <fieldset aria-describedby={describedBy} className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">{t('legend')}</legend>
      <div dir="ltr" className="flex justify-between gap-2">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <label key={i} className="min-w-0 flex-1">
            <span className="sr-only">{t('digit', { n: i + 1 })}</span>
            <input
              ref={(el) => {
                boxes.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={i === 0 ? CODE_LENGTH : 1}
              value={value[i] ?? ''}
              disabled={disabled}
              aria-invalid={invalid}
              onChange={(e) => onInput(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={(e) => onPaste(i, e)}
              onFocus={(e) => e.target.select()}
              className={cn(
                'h-14 w-full rounded-input border border-line-strong bg-surface text-center text-2xl font-bold text-ink transition-[border-color,box-shadow] duration-200',
                'focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring',
                'aria-[invalid=true]:border-danger disabled:opacity-60',
                value[i] && 'border-ink',
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
});
