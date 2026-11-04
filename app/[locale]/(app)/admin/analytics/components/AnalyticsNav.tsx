'use client';

import { ChartColumn, Download, Globe, Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

type SectionId = 'overview' | 'equity' | 'engagement' | 'export';

const items: { id: SectionId; icon: LucideIcon }[] = [
  { id: 'overview', icon: ChartColumn },
  { id: 'equity', icon: Globe },
  { id: 'engagement', icon: Users },
  { id: 'export', icon: Download },
];

/**
 * The dashboard's own menu. Each link scrolls to a section on this page; the
 * section in view is highlighted. Stacks above the content on phones.
 */
export function AnalyticsNav() {
  const t = useTranslations('analytics.nav');
  const [active, setActive] = useState<SectionId>('overview');

  useEffect(() => {
    const sections = items
      .map(({ id }) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0 || !('IntersectionObserver' in window)) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.intersectionRatio);
        // The first section (in page order) that is meaningfully in view.
        const current = items.find(({ id }) => (visible.get(id) ?? 0) > 0.25);
        if (current) setActive(current.id);
      },
      { threshold: [0, 0.25, 0.5, 1] },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label={t('label')}>
      <ul className="flex flex-wrap gap-1 md:flex-col">
        {items.map(({ id, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? 'location' : undefined}
              onClick={() => setActive(id)}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold no-underline transition-colors',
                active === id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-brand-tint hover:text-ink',
              )}
            >
              <Icon aria-hidden="true" className="size-5 flex-none" strokeWidth={2} />
              {t(id)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
