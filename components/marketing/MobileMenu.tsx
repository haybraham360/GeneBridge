'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { LanguageSwitch } from './LanguageSwitch';
import { navItems } from './navItems';

export function MobileMenu() {
  const t = useTranslations('landing.header');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);
  const linkClass =
    'flex min-h-12 items-center rounded-xl px-4 text-base font-semibold text-white no-underline hover:bg-white/10 focus-visible:outline-white';

  return (
    <div className="lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t('closeMenu') : t('openMenu')}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-12 items-center justify-center rounded-full bg-ink text-white hover:bg-[#2E2A27]"
      >
        {open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
      </button>

      <nav
        id={panelId}
        aria-label={t('navLabel')}
        hidden={!open}
        className="absolute inset-x-4 top-[88px] z-40 rounded-3xl bg-ink p-3 shadow-card transition-[opacity,translate] duration-200 starting:-translate-y-2 starting:opacity-0"
      >
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => (
            <li key={item.key}>
              <a href={item.href} onClick={close} className={linkClass}>
                {t(item.key)}
              </a>
            </li>
          ))}
          <li>
            <LanguageSwitch onNavigate={close} className={linkClass} />
          </li>
          <li className="pt-2">
            <Link
              href="/auth"
              onClick={close}
              className={buttonClasses('ghost', 'md', 'w-full border-0 focus-visible:outline-white')}
            >
              {t('getStarted')}
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
