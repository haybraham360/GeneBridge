'use client';

import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
  Camera,
  Check,
  EyeOff,
  Lock,
  MapPin,
  Mic,
  Network,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { buttonArrowClasses, buttonClasses } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

type ToolKey = 'blindMatch' | 'scan' | 'family' | 'assistant' | 'nearby';

type Tool = {
  key: ToolKey;
  href: string;
  icon: LucideIcon;
  /** Icon badge in the tab. */
  badge: string;
  /** Tinted stage behind the scene. */
  stage: string;
  Scene: () => ReactNode;
  /** The newest tool: a "New" badge, and the full row on phones. */
  featured?: boolean;
};

/** Start time of a scene element (see the `scene` utility in globals.css). */
const at = (ms: number) => ({ '--t': `${ms}ms` }) as CSSProperties;

/** How long each tool stays on screen before the next one, while auto-playing. */
const SLIDE_MS = 7000;

/* ---------------- Scenes (decorative, aria-hidden, labelled "Example") ---------------- */

function BlindMatchScene() {
  const t = useTranslations('landing.showcase.blindMatch.scene');
  // Two phones. Each keeps its result hidden; both agree; both get one answer.
  const phone = (who: string, top: ReactNode, delay: number) => (
    <div className="s-rise flex w-[132px] shrink-0 flex-col items-center gap-2 rounded-[22px] border-[3px] border-ink bg-surface px-2.5 pt-3 pb-3 shadow-card sm:w-[150px]" style={at(delay)}>
      <span className="h-1 w-8 rounded-full bg-line-strong" />
      <span className="text-[11px] font-extrabold text-ink">{who}</span>
      <div className="flex h-[58px] items-center justify-center">{top}</div>
      <span className="flex items-center gap-1 rounded-full bg-bg px-2 py-1 text-[10px] font-bold text-muted">
        <EyeOff aria-hidden="true" className="size-3" strokeWidth={2.4} />
        {t('hidden')}
      </span>
      <span className="s-pop flex items-center gap-1 rounded-full bg-success-tint px-2 py-1 text-[10px] font-bold text-success-text" style={at(1500 + delay)}>
        <Check aria-hidden="true" className="size-3" strokeWidth={3} />
        {t('agreed')}
      </span>
    </div>
  );
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 pt-6 sm:px-8 sm:pt-0">
      <div className="flex items-center gap-2 sm:gap-4">
        {phone(
          t('you'),
          <span className="flex flex-col items-center gap-1">
            <QrCode aria-hidden="true" className="s-pop size-9 text-ink" style={at(400)} strokeWidth={2} />
            <span dir="ltr" className="font-mono text-[10px] font-extrabold tracking-[0.15em]">{t('code')}</span>
          </span>,
          0,
        )}
        {/* The code travels from one phone to the other. */}
        <span className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((d) => (
            <span key={d} className="s-bar size-1.5 rounded-full bg-brand" style={{ '--d': d * 2 } as CSSProperties} />
          ))}
        </span>
        {phone(
          t('them'),
          <span className="flex flex-col items-center gap-1">
            <ScanLine aria-hidden="true" className="s-pop size-9 text-ink" style={at(900)} strokeWidth={2} />
            <span className="s-fade text-[10px] font-extrabold text-success-text" style={at(1100)}>{t('scan')}</span>
          </span>,
          150,
        )}
      </div>
      <div className="s-pop flex flex-col items-center gap-1 rounded-tile border-2 border-brand bg-surface px-4 py-2.5 text-center shadow-card" style={at(2400)}>
        <span className="text-[13px] font-extrabold text-ink">{t('answer')}</span>
        <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-success-text">
          <Lock aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.4} />
          {t('neither')}
        </span>
      </div>
    </div>
  );
}

function ScanScene() {
  const t = useTranslations('landing.showcase.scan.scene');
  return (
    <div className="flex h-full items-center gap-4 px-5 sm:gap-6 sm:px-8">
      {/* The report, with viewfinder corners and a sweeping scan line. */}
      <div className="s-float relative h-[230px] w-[44%] max-w-[210px] shrink-0">
        <div className="absolute inset-0 overflow-hidden rounded-tile border border-line-strong bg-surface p-4 shadow-card">
          <p className="text-[11px] font-extrabold text-ink">{t('report')}</p>
          <div className="mt-3 flex flex-col gap-2">
            {['w-11/12', 'w-8/12', 'w-10/12', 'w-7/12', 'w-9/12', 'w-6/12'].map((w, i) => (
              <span key={i} className={cn('h-2 rounded-full bg-neutral-fill', w)} />
            ))}
          </div>
          <span className="mt-4 block h-3 w-5/12 rounded-full bg-brand-tint" />
          <div className="s-sweep absolute inset-x-0 top-3 [--sweep:190px]">
            <span className="block h-6 bg-linear-to-b from-transparent to-brand/20" />
            <span className="block h-[3px] bg-brand" />
          </div>
        </div>
        {['-start-2 -top-2 border-s-[3px] border-t-[3px] rounded-ss-lg', '-end-2 -top-2 border-e-[3px] border-t-[3px] rounded-se-lg', '-start-2 -bottom-2 border-s-[3px] border-b-[3px] rounded-es-lg', '-end-2 -bottom-2 border-e-[3px] border-b-[3px] rounded-ee-lg'].map((c) => (
          <span key={c} className={cn('absolute size-6 border-brand-text', c)} />
        ))}
      </div>

      {/* What was read, explained. Colour always comes with a text label. */}
      <div className="mt-7 flex min-w-0 flex-1 flex-col gap-2.5 sm:mt-0">
        <div className="s-pop flex flex-col rounded-input border border-line bg-surface px-3.5 py-2.5 shadow-card" style={at(900)}>
          <span className="text-[13px] font-bold">{t('finding')}</span>
          <span className="text-[12px] font-bold text-brand-text-dark">{t('carrier')}</span>
        </div>
        <div className="s-pop flex flex-col rounded-input border border-line bg-surface px-3.5 py-2.5 shadow-card" style={at(1300)}>
          <span className="text-[13px] font-bold">{t('rest')}</span>
          <span className="text-[12px] font-bold text-success-text">{t('noChanges')}</span>
        </div>
        <div className="s-pop flex items-center gap-2 rounded-input bg-success-tint px-3.5 py-2.5 text-[13px] font-bold text-success-text" style={at(1700)}>
          <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.6} />
          {t('healthy')}
        </div>
        <div className="s-pop flex w-fit items-center gap-2 rounded-full bg-ink py-1.5 ps-2 pe-3.5 text-[12px] font-bold text-white" style={at(2300)}>
          <span className="flex h-4 items-center gap-[3px]">
            {[8, 14, 10, 16, 9].map((h, i) => (
              <span key={i} className="s-bar w-[3px] rounded-full bg-brand" style={{ height: h, '--d': i } as CSSProperties} />
            ))}
          </span>
          {t('listen')}
        </div>
      </div>
    </div>
  );
}

function FamilyScene() {
  const t = useTranslations('landing.showcase.family.scene');
  // Squares and circles, pedigree style. Dashed = proposed, not yet kept.
  // Shapes are never filled: a filled shape means "affected" in a pedigree.
  const line = 'stroke-success-text/60';
  const proposed = 'fill-surface stroke-ink/55 [stroke-dasharray:4_3]';
  const kept = 'fill-none stroke-ink s-fade';
  const pop = 's-pop origin-center [transform-box:fill-box]';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-5 sm:px-8">
      <p className="s-rise me-14 flex max-w-[420px] items-start gap-2.5 rounded-[18px] sm:me-0 rounded-es-md bg-ink px-4 py-3 text-[13.5px] leading-snug font-semibold text-white">
        <Mic aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2.4} />
        <span>
          {t('before')}{' '}
          {/* The name is masked on the device before anything is sent. */}
          <span className="inline-grid align-bottom [&>*]:[grid-area:1/1]">
            <span className="s-out motion-reduce:hidden" style={at(1300)}>
              {t('name')}
            </span>
            <span dir="ltr" className="s-pop rounded-md bg-brand/25 px-1 font-mono text-[12px] text-[#FFB08F]" style={at(1500)}>
              {t('masked')}
            </span>
          </span>{' '}
          {t('after')}
        </span>
      </p>

      <svg viewBox="0 0 260 150" className="w-full max-w-[360px] overflow-visible" aria-hidden="true">
        <g className={line} strokeWidth="1.8" fill="none" strokeLinecap="round">
          <path className="s-draw" style={at(1900)} pathLength={100} d="M108 22h44" />
          <path className="s-draw" style={at(2050)} pathLength={100} d="M130 22v24H80v18M130 46h50v18" />
          <path className="s-draw" style={at(2300)} pathLength={100} d="M80 84v28" />
        </g>
        {/* Grandparents and uncle: proposed, then kept. */}
        <g className={pop} style={at(1800)}>
          <rect x="84" y="11" width="22" height="22" rx="4" className={proposed} strokeWidth="1.8" />
          <rect x="84" y="11" width="22" height="22" rx="4" className={kept} style={at(3300)} strokeWidth="1.8" />
        </g>
        <g className={pop} style={at(1850)}>
          <circle cx="165" cy="22" r="11" className={proposed} strokeWidth="1.8" />
          <circle cx="165" cy="22" r="11" className={kept} style={at(3300)} strokeWidth="1.8" />
        </g>
        <g className={pop} style={at(2150)}>
          <rect x="169" y="64" width="22" height="22" rx="4" className={proposed} strokeWidth="1.8" />
          <rect x="169" y="64" width="22" height="22" rx="4" className={kept} style={at(3300)} strokeWidth="1.8" />
          <text x="180" y="102" textAnchor="middle" className="fill-ink text-[10px] font-bold">{t('uncle')}</text>
          <text x="180" y="115" textAnchor="middle" className="fill-brand-text text-[9.5px] font-bold">{t('condition')}</text>
        </g>
        {/* Already on the map. */}
        <rect x="69" y="64" width="22" height="22" rx="4" className="fill-surface stroke-ink" strokeWidth="1.8" />
        <text x="60" y="79" textAnchor="end" className="fill-ink text-[10px] font-bold">{t('father')}</text>
        <circle cx="80" cy="123" r="15" className="fill-none stroke-success-text/40" strokeWidth="1.5" />
        <circle cx="80" cy="123" r="10" className="fill-surface stroke-success-text" strokeWidth="2" />
        <text x="104" y="127" className="fill-success-text text-[10px] font-extrabold">{t('you')}</text>
      </svg>

      <span className="s-pop inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-[12px] font-bold text-ink shadow-card" style={at(2900)}>
        <Check aria-hidden="true" className="size-3.5 text-success-text" strokeWidth={2.8} />
        {t('keep')}
      </span>
    </div>
  );
}

function AssistantScene() {
  const t = useTranslations('landing.showcase.assistant.scene');
  return (
    <div className="flex h-full flex-col justify-center gap-3 px-5 sm:px-10">
      <p className="s-rise max-w-[78%] self-end rounded-[18px] rounded-ee-md bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-ink">
        {t('question')}
      </p>
      <div className="inline-grid max-w-[88%] self-start [&>*]:[grid-area:1/1]">
        {/* Typing dots, then the answer in the same spot. */}
        <span className="s-fade flex h-10 w-16 items-center justify-center gap-1 self-start rounded-[18px] bg-surface shadow-card motion-reduce:hidden" style={at(500)}>
          <span className="s-out flex gap-1" style={at(1250)}>
            {[0, 1, 2].map((d) => (
              <span key={d} className="s-bar size-1.5 rounded-full bg-muted" style={{ '--d': d * 2 } as CSSProperties} />
            ))}
          </span>
        </span>
        <div className="s-rise flex flex-col gap-2.5 rounded-[18px] rounded-es-md border border-line bg-surface px-4 py-3 shadow-card" style={at(1300)}>
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-brand-text">
            <Sparkles aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
            {t('from')}
          </p>
          <p className="text-[13.5px] leading-[1.5] text-ink">{t('answer')}</p>
          <div className="s-fade flex items-center gap-2 border-t border-line pt-2.5 text-[12px] font-bold text-muted" style={at(1900)}>
            <span className="flex h-4 items-center gap-[3px]">
              {[7, 13, 9, 15, 8, 12].map((h, i) => (
                <span key={i} className="s-bar w-[3px] rounded-full bg-brand" style={{ height: h, '--d': i } as CSSProperties} />
              ))}
            </span>
            {t('reading')}
          </div>
        </div>
      </div>
      <span className="s-pop inline-flex w-fit items-center gap-1.5 self-start rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-ink" style={at(2500)}>
        {t('counsellor')}
        <ArrowRight aria-hidden="true" className="size-3.5 rtl:-scale-x-100" strokeWidth={2.4} />
      </span>
    </div>
  );
}

function NearbyScene() {
  const t = useTranslations('landing.showcase.nearby.scene');
  const pins = [
    { pos: 'start-[18%] top-[20%]', t: 500 },
    { pos: 'start-[70%] top-[14%]', t: 750 },
    { pos: 'start-[78%] top-[46%]', t: 1000 },
  ];
  return (
    <div className="relative h-full overflow-hidden">
      {/* A simple, made-up street map. */}
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
        <path d="M-10 210C80 190 140 120 230 130s140 60 190 40" className="fill-none stroke-surface" strokeWidth="16" strokeLinecap="round" />
        <path d="M120-10c10 90 40 160 20 320M290-10c-20 80 10 170-10 320" className="fill-none stroke-surface" strokeWidth="11" strokeLinecap="round" />
        <path d="M-10 70h420M-10 260h420" className="fill-none stroke-surface/70" strokeWidth="6" />
        <ellipse cx="330" cy="240" rx="70" ry="42" className="fill-success-tint" />
        <ellipse cx="40" cy="40" rx="60" ry="34" className="fill-success-tint" />
      </svg>

      {/* You: an approximate area, never an exact point. */}
      <div className="absolute start-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2">
        <span className="absolute -inset-[52px] rounded-full border-2 border-dashed border-info-text/30" />
        <span className="s-ring absolute -inset-[52px] rounded-full bg-info-text/15" />
        <span className="s-ring absolute -inset-[52px] rounded-full bg-info-text/15" style={at(1300)} />
        <span className="relative flex size-5 items-center justify-center rounded-full bg-info-text ring-4 ring-surface" />
      </div>

      {pins.map((p) => (
        <span key={p.pos} className={cn('s-pin absolute flex size-9 items-center justify-center rounded-full rounded-ee-none bg-ink text-white shadow-card rotate-45', p.pos)} style={at(p.t)}>
          <MapPin aria-hidden="true" className="size-4 -rotate-45" strokeWidth={2.4} />
        </span>
      ))}

      <div className="s-rise absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-tile border border-line bg-surface p-3 shadow-card sm:inset-x-auto sm:start-6 sm:w-[300px]" style={at(1500)}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-extrabold text-white">{t('initials')}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[13px] font-bold">
            <span className="truncate">{t('role')}</span>
            <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-success-text" strokeWidth={2.4} />
          </p>
          <p className="text-[12px] text-muted">{t('detail')}</p>
        </div>
      </div>
    </div>
  );
}

const tools: Tool[] = [
  { key: 'blindMatch', href: '/dashboard/blind-match', icon: EyeOff, badge: 'bg-brand text-ink', stage: 'bg-[#FFF4EC]', Scene: BlindMatchScene, featured: true },
  { key: 'scan', href: '/dashboard/scan', icon: Camera, badge: 'bg-brand-tint text-brand-text-dark', stage: 'bg-brand-tint-soft', Scene: ScanScene },
  { key: 'family', href: '/dashboard/family', icon: Network, badge: 'bg-success-tint text-success-text', stage: 'bg-success-tint/70', Scene: FamilyScene },
  { key: 'assistant', href: '/dashboard/assistant', icon: AudioLines, badge: 'bg-[#FFE3D3] text-brand-text-dark', stage: 'bg-bg', Scene: AssistantScene },
  { key: 'nearby', href: '/dashboard/nearby', icon: MapPin, badge: 'bg-info-tint text-info-text', stage: 'bg-info-tint', Scene: NearbyScene },
];

/**
 * "New in GeneBridge": the newer tools, one at a time. A tab list on the
 * start side and one large animated scene, so the section never feels busy.
 * It moves to the next tool every few seconds until the visitor picks one,
 * pauses on hover, focus or off screen, and never auto-advances for reduced
 * motion. Each tool keeps its own guardrails on its own page; this only links.
 */
export function ToolShowcase() {
  const t = useTranslations('landing.showcase');
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const choose = (index: number, focus = false) => {
    setAuto(false);
    setActive(index);
    if (focus) tabRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = document.documentElement.dir === 'rtl';
    const next = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      choose((active + next + tools.length) % tools.length, true);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      choose(event.key === 'Home' ? 0 : tools.length - 1, true);
    }
  };

  const tool = tools[active];
  const { Scene } = tool;

  return (
    <section
      ref={sectionRef}
      id="tools"
      data-paused={visible ? undefined : ''}
      className="showcase mx-auto mt-28 max-w-[1200px] px-6"
    >
      <div className="reveal flex flex-col items-center gap-4 text-center">
        <SectionHeading
          chip={t('chip')}
          chipIcon={Sparkles}
          title={t('title')}
          titleClassName="max-w-[760px] text-[clamp(32px,4vw,48px)] tracking-[-0.025em]"
        />
        <p className="max-w-[620px] text-base leading-[1.6] text-muted">{t('subtitle')}</p>
      </div>

      <div className="reveal mt-12 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:items-center lg:gap-8">
        <div
          role="tablist"
          aria-label={t('tabsLabel')}
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
          className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-2.5"
        >
          {tools.map(({ key, icon: Icon, badge, featured }, index) => {
            const selected = index === active;
            return (
              <button
                key={key}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${key}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(index)}
                className={cn(
                  'group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-tile border p-3 text-start transition-[background-color,border-color,box-shadow,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:p-4',
                  featured && 'col-span-2 lg:col-span-1',
                  selected
                    ? 'border-line bg-surface shadow-[0_12px_32px_rgba(60,30,10,0.08)] lg:translate-x-1.5 rtl:lg:-translate-x-1.5'
                    : 'border-transparent hover:border-line hover:bg-surface/60',
                )}
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full transition-transform duration-300 lg:size-11',
                    badge,
                    selected ? 'scale-105' : 'group-hover:scale-105',
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={2.2} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] leading-snug font-extrabold text-ink lg:text-[16px]">
                    {t(`${key}.tab`)}
                    {featured ? (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-extrabold tracking-wide text-ink uppercase">
                        {t('blindMatch.new')}
                      </span>
                    ) : null}
                  </span>
                  <span className="hidden text-[13px] text-muted sm:block">{t(`${key}.tag`)}</span>
                </span>
                {selected && auto ? (
                  <span aria-hidden="true" className="absolute inset-x-4 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-line">
                    <span
                      key={active}
                      className="showcase-progress block h-full rounded-full bg-brand"
                      style={{ '--dur': `${SLIDE_MS}ms` } as CSSProperties}
                      onAnimationEnd={() => setActive((a) => (a + 1) % tools.length)}
                    />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${tool.key}`}
          className="overflow-hidden rounded-[28px] border border-line bg-surface shadow-card"
        >
          <div
            aria-hidden="true"
            className={cn('relative h-[300px] transition-colors duration-500 sm:h-[330px]', tool.stage)}
          >
            {/* Remounted per tool, so its sequence plays from the start. */}
            <div key={tool.key} className="scene size-full motion-safe:animate-cross-fade">
              <Scene />
            </div>
            <span className="absolute end-3 top-3 rounded-full bg-surface/85 px-2.5 py-1 text-[11px] font-bold text-muted backdrop-blur-sm">
              {t('example')}
            </span>
          </div>

          <div key={tool.key} className="flex flex-col gap-3 p-6 motion-safe:animate-fade-up sm:p-8">
            <h3 className="font-display text-[clamp(22px,2.4vw,28px)] leading-tight font-extrabold tracking-[-0.015em]">
              {t(`${tool.key}.title`)}
            </h3>
            <p className="text-[15px] leading-[1.6] text-muted">{t(`${tool.key}.body`)}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold text-success-text">
                {tool.key === 'family' || tool.key === 'blindMatch' ? (
                  <Lock aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.2} />
                ) : (
                  <ShieldCheck aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.2} />
                )}
                {t(`${tool.key}.promise`)}
              </p>
              <Link href={tool.href} className={buttonClasses('dark', 'sm')}>
                {t(`${tool.key}.cta`)}
                <ArrowRight aria-hidden="true" className={buttonArrowClasses} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
