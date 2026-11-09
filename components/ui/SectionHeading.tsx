import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Chip } from './Chip';

type SectionHeadingProps = {
  chip?: ReactNode;
  chipIcon?: LucideIcon;
  title?: ReactNode;
  align?: 'center' | 'start';
  /** Applied to the heading text, e.g. to cap its width. */
  titleClassName?: string;
  className?: string;
};

/**
 * Chip + h2. When there is no title, the chip itself becomes the h2 so every
 * section keeps a heading for screen readers.
 */
export function SectionHeading({
  chip,
  chipIcon,
  title,
  align = 'center',
  titleClassName,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-5',
        align === 'center' ? 'items-center text-center' : 'items-start text-start',
        className,
      )}
    >
      {chip ? (
        <Chip icon={chipIcon} as={title ? 'span' : 'h2'}>
          {chip}
        </Chip>
      ) : null}
      {title ? (
        <h2
          className={cn(
            'font-display text-[clamp(30px,3.6vw,42px)] leading-[1.1] font-extrabold tracking-[-0.02em]',
            titleClassName,
          )}
        >
          {title}
        </h2>
      ) : null}
    </div>
  );
}
