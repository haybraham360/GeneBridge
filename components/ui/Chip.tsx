import type { ElementType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

type ChipProps = {
  icon?: LucideIcon;
  /** Render as a heading (e.g. `h2`) when the chip is the only label of a section. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

export function Chip({ icon: Icon, as: Component = 'span', className, children }: ChipProps) {
  return (
    <Component
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink',
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-brand-text" strokeWidth={2} /> : null}
      {children}
    </Component>
  );
}
