import { ArrowRight, Camera, Lock, MousePointerClick, Mic, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

type ToolKey = 'scan' | 'family' | 'simulator' | 'talk';

type Tool = {
  key: ToolKey;
  href: string;
  icon: LucideIcon;
  /** Tinted panel behind the illustration. */
  panel: string;
  art: ReactNode;
};

/* ---------- Illustrations (decorative, aria-hidden; animate on hover) ---------- */

function ScanArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      {/* The report */}
      <rect x="38" y="12" width="44" height="56" rx="5" className="fill-surface stroke-line-strong" strokeWidth="1.5" />
      <rect x="45" y="21" width="22" height="3.5" rx="1.75" className="fill-ink/70" />
      {[30, 37, 44, 51].map((y, i) => (
        <rect key={y} x="45" y={y} width={i % 2 ? 24 : 30} height="3" rx="1.5" className="fill-neutral-fill" />
      ))}
      <rect x="45" y="58" width="14" height="4" rx="2" className="fill-brand-tint" />
      {/* Viewfinder corners */}
      <g className="stroke-brand-text" strokeWidth="2.2" fill="none" strokeLinecap="round">
        <path d="M30 18v-8h8M90 18v-8h-8M30 62v8h8M90 62v8h-8" />
      </g>
      {/* Scan line */}
      <g className="scan-line">
        <rect x="32" y="20" width="56" height="2.5" rx="1.25" className="fill-brand" />
        <rect x="32" y="12" width="56" height="8" className="fill-brand/15" />
      </g>
    </svg>
  );
}

function FamilyArt() {
  // Pedigree style: squares and circles, joined by lines that draw on hover.
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <g className="stroke-success-text/60" strokeWidth="1.8" fill="none" strokeLinecap="round">
        <path className="tree-line" d="M44 18h32" />
        <path className="tree-line" d="M60 18v18" />
        <path className="tree-line" d="M34 36h52" />
        <path className="tree-line" d="M34 36v12M60 36v12M86 36v12" />
      </g>
      <rect x="32" y="11" width="13" height="13" rx="2.5" className="fill-surface stroke-ink" strokeWidth="1.8" />
      <circle cx="82" cy="17.5" r="6.8" className="fill-surface stroke-ink" strokeWidth="1.8" />
      <rect x="27.5" y="48" width="13" height="13" rx="2.5" className="fill-surface stroke-ink" strokeWidth="1.8" />
      {/* "You": outlined, never filled (a filled shape means affected in a pedigree). */}
      <circle cx="60" cy="54.5" r="10.5" className="fill-none stroke-success-text/40" strokeWidth="1.5" />
      <circle cx="60" cy="54.5" r="6.8" className="fill-surface stroke-success-text" strokeWidth="2" />
      <rect x="79.5" y="48" width="13" height="13" rx="2.5" className="fill-surface stroke-ink" strokeWidth="1.8" />
    </svg>
  );
}

function SimulatorArt() {
  // Two parents' copies (typical and changed), and a child's pair below.
  const bead = (cx: number, cy: number, changed: boolean, d: number) => (
    <circle
      key={`${cx}-${cy}`}
      cx={cx}
      cy={cy}
      r="6.5"
      className={cn('bead', changed ? 'fill-brand' : 'fill-bead-typical stroke-neutral-line')}
      strokeWidth={changed ? 0 : 1.2}
      style={{ '--d': d } as CSSProperties}
    />
  );
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <rect x="20" y="8" width="34" height="22" rx="11" className="fill-surface" />
      <rect x="66" y="8" width="34" height="22" rx="11" className="fill-surface" />
      <g className="stroke-info-text/35" strokeWidth="1.6" fill="none" strokeDasharray="3 3">
        <path d="M37 30v10h23v8M83 30v10H60" />
      </g>
      <rect x="43" y="48" width="34" height="22" rx="11" className="fill-surface" />
      {bead(30, 19, false, 0)}
      {bead(44, 19, true, 1)}
      {bead(76, 19, false, 2)}
      {bead(90, 19, true, 3)}
      {bead(53, 59, true, 4)}
      {bead(67, 59, false, 5)}
    </svg>
  );
}

function TalkArt() {
  const heights = [10, 18, 26, 34, 26, 18, 30, 14, 22];
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <path d="M22 16a8 8 0 0 1 8-8h60a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H48l-12 10v-10h-6a8 8 0 0 1-8-8z" className="fill-ink" />
      {heights.map((h, i) => (
        <rect
          key={i}
          className="voice-bar fill-brand"
          x={36 + i * 6}
          y={34 - h / 2}
          width="3.4"
          height={h}
          rx="1.7"
          style={{ '--d': i } as CSSProperties}
        />
      ))}
    </svg>
  );
}

const tools: Tool[] = [
  { key: 'scan', href: '/dashboard/scan?from=home', icon: Camera, panel: 'bg-brand-tint-soft', art: <ScanArt /> },
  { key: 'family', href: '/dashboard/family', icon: Lock, panel: 'bg-success-tint', art: <FamilyArt /> },
  { key: 'simulator', href: '/dashboard/simulator', icon: MousePointerClick, panel: 'bg-info-tint', art: <SimulatorArt /> },
  { key: 'talk', href: '/dashboard/assistant', icon: Mic, panel: 'bg-brand-tint', art: <TalkArt /> },
];

/**
 * The four main tools on Home: scan a report, draw the family tree, the
 * inheritance simulator, and talking to Ask GeneBridge. Links only; every
 * tool keeps its own guardrails on its own page.
 */
export default async function ToolSpotlight({ style }: { style?: CSSProperties }) {
  const t = await getTranslations('dashboard.spotlight');
  return (
    <section aria-labelledby="tools-title" className="rise-in" style={style}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="tools-title" className="text-[20px] leading-tight font-extrabold tracking-[-0.01em]">
            {t('title')}
          </h2>
          <p className="mt-1 text-[14px] text-muted">{t('subtitle')}</p>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tools.map(({ key, href, icon: Icon, panel, art }) => (
          <li key={key} className="min-w-0">
            <Link
              href={href}
              data-tool={key}
              className="group flex h-full flex-row gap-3 rounded-card border border-line bg-surface p-2.5 shadow-card no-underline transition-[translate,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-brand-ring hover:shadow-[0_16px_36px_rgba(60,30,10,0.10)] focus-visible:-translate-y-1 sm:flex-col sm:gap-0 sm:p-3"
            >
              {/* Beside the text on phones, above it from 640px. */}
              <div className={cn('tool-art flex w-26 flex-none items-center overflow-hidden rounded-tile sm:h-28 sm:w-auto', panel)}>
                {art}
              </div>
              <div className="flex min-w-0 flex-1 flex-col py-1 pe-1 sm:px-1.5 sm:pt-3.5 sm:pb-1.5">
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[11px] font-bold text-ink-soft">
                  <Icon aria-hidden="true" className="size-3" strokeWidth={2.2} />
                  {t(`${key}.tag`)}
                </span>
                <h3 className="mt-2 text-[16px] leading-snug font-extrabold text-ink">{t(`${key}.title`)}</h3>
                <p className="mt-1 text-[13.5px] leading-normal text-muted">{t(`${key}.body`)}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2.5 text-[14px] font-extrabold text-brand-text sm:pt-3.5">
                  {t(`${key}.cta`)}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform duration-300 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1"
                    strokeWidth={2.2}
                  />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
