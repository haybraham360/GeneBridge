import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn('flex flex-col', className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-base leading-normal">
          <Check aria-hidden="true" className="mt-px size-[22px] shrink-0 text-brand" strokeWidth={2} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
