'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export type OptionCard<V extends string> = {
  value: V;
  label: string;
  sub: string;
  /** Language of the label when it differs from the page (e.g. "हिन्दी"). */
  lang?: string;
};

type OptionCardsProps<V extends string> = {
  options: OptionCard<V>[];
  value: V | null;
  onChange: (value: V) => void;
  /** Enter on a chosen card: move to the next step. */
  onSubmit: () => void;
  labelledBy: string;
  /**
   * 'auto': arrow keys choose as they move (the usual radio behaviour).
   * 'manual': arrow keys only move focus; Space or Enter chooses. Used for
   * language, where choosing reloads the page in that language.
   */
  activation?: 'auto' | 'manual';
  disabled?: boolean;
};

/** Large selectable cards from the design, as an accessible radio group. */
export function OptionCards<V extends string>({
  options,
  value,
  onChange,
  onSubmit,
  labelledBy,
  activation = 'auto',
  disabled = false,
}: OptionCardsProps<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = ['ArrowDown', rtl ? 'ArrowLeft' : 'ArrowRight'];
    const backward = ['ArrowUp', rtl ? 'ArrowRight' : 'ArrowLeft'];

    let target: number | null = null;
    if (forward.includes(event.key)) target = (index + 1) % options.length;
    else if (backward.includes(event.key)) target = (index - 1 + options.length) % options.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = options.length - 1;

    if (target !== null) {
      event.preventDefault();
      refs.current[target]?.focus();
      if (activation === 'auto') onChange(options[target].value);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (options[index].value === value) onSubmit();
      else onChange(options[index].value);
    }
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-col gap-2.5">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={disabled || undefined}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => {
              if (!disabled && !selected) onChange(option.value);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'flex min-h-[60px] w-full cursor-pointer items-center justify-between gap-3 rounded-tile border-2 px-[18px] py-3.5 text-start text-ink',
              'transition-[background-color,border-color,box-shadow] duration-200 ease-out',
              selected
                ? 'border-brand bg-brand-tint'
                : 'border-[#EADBD0] bg-surface hover:border-brand-ring hover:bg-brand-tint-soft',
            )}
          >
            <span className="flex flex-col gap-0.5">
              <span lang={option.lang} className="text-base font-bold">
                {option.label}
              </span>
              <span className="text-[13px] text-muted">{option.sub}</span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'flex size-[22px] flex-none items-center justify-center rounded-full border-2 transition-colors duration-200',
                selected ? 'border-brand bg-brand' : 'border-[#EADBD0] bg-surface',
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full bg-ink transition-transform duration-200 ease-out',
                  selected ? 'scale-100' : 'scale-0',
                )}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
