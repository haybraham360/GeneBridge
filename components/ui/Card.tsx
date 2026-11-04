import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const cardClasses = 'bg-surface border border-line rounded-card shadow-card';

type CardProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

export function Card({ as: Component = 'div', className, children }: CardProps) {
  return <Component className={cn(cardClasses, className)}>{children}</Component>;
}
