import { Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DnaHelix } from './DnaHelix';

/**
 * Orange "Private by design" panel. Beside the form on wide screens; below it
 * on phones, shortened to the three checks.
 */
export function PrivacyPanel() {
  const t = useTranslations('auth.panel');
  // Literal class strings so Tailwind can see them.
  const checks = [
    ['check1', 'motion-safe:[animation-delay:200ms]'],
    ['check2', 'motion-safe:[animation-delay:280ms]'],
    ['check3', 'motion-safe:[animation-delay:360ms]'],
  ] as const;

  return (
    <aside className="relative isolate flex flex-[1_1_420px] flex-col justify-center gap-8 overflow-hidden bg-brand bg-[radial-gradient(70%_60%_at_100%_0%,rgba(255,116,64,0.9),transparent_70%),radial-gradient(60%_50%_at_0%_100%,rgba(194,65,12,0.35),transparent_70%)] px-[clamp(24px,5vw,72px)] py-14 text-ink">
      {/* Faint base-pair dot grid, then the turning helix above the heading. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(rgba(20,20,20,0.12)_1px,transparent_1.5px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)]"
      />
      <DnaHelix className="relative hidden h-[140px] w-full max-w-[460px] -rotate-[6deg] motion-safe:animate-fade-up min-[900px]:block rtl:rotate-[6deg]" />
      <h2 className="font-display text-[clamp(36px,4vw,52px)] leading-[1.05] font-extrabold tracking-[-0.03em] motion-safe:animate-fade-up motion-safe:[animation-delay:120ms]">
        {t('heading')}
      </h2>
      <ul className="flex flex-col gap-4 text-lg font-semibold">
        {checks.map(([key, delay]) => (
          <li key={key} className={`flex items-center gap-3 motion-safe:animate-fade-up ${delay}`}>
            <Check aria-hidden="true" className="size-6 shrink-0" strokeWidth={2} />
            {t(key)}
          </li>
        ))}
      </ul>
      <div className="hidden max-w-[420px] -rotate-[1.5deg] flex-col gap-3 rounded-[24px] bg-surface p-6 transition-[rotate,translate] duration-300 hover:rotate-0 hover:-translate-y-1 motion-safe:animate-fade-up motion-safe:[animation-delay:460ms] min-[900px]:flex rtl:rotate-[1.5deg] rtl:hover:rotate-0">
        <p className="flex items-center gap-2.5 font-extrabold">
          <Lock aria-hidden="true" className="size-5 text-brand-text" strokeWidth={2} />
          {t('partnerTitle')}
        </p>
        <p className="text-[15px] leading-[1.55] text-muted">{t('partnerBody')}</p>
      </div>
    </aside>
  );
}
