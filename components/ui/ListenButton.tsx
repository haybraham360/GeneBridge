'use client';

import { Square, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { isSpeechSupported } from '@/lib/audio/tts';
import { cn } from '@/lib/cn';

const noopSubscribe = () => () => {};

/** True once mounted in a browser that can speak. False during server render. */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, isSpeechSupported, () => false);
}

type ListenButtonProps = {
  speaking: boolean;
  onToggle: () => void;
  className?: string;
};

/**
 * Round "Listen" button. Becomes "Stop" while reading. Hidden when the
 * browser can't speak, rather than showing a button that does nothing.
 */
export function ListenButton({ speaking, onToggle, className }: ListenButtonProps) {
  const t = useTranslations('common.listen');
  const supported = useSpeechSupported();
  if (!supported) return null;

  const Icon = speaking ? Square : Volume2;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={speaking ? t('stop') : t('play')}
      className={cn(
        'flex size-12 flex-none cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors duration-200 hover:bg-brand-tint-soft',
        speaking && 'border-brand bg-brand-tint',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
    </button>
  );
}
