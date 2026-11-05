'use client';

import { ArrowDown, ChevronDown, Info, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { logSimulatorRun } from '@/app/[locale]/(app)/dashboard/simulator/actions';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { ListenPill } from '@/components/ui/ListenPill';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { conditionGuideHref } from '@/lib/conditions/links';
import { searchConditions, type CatalogueCondition } from '@/lib/conditions/search';
import {
  calculateInheritance,
  childOf,
  expectedCounts,
  parentCopies,
  patterns,
  statusesFor,
  type Allele,
  type Child,
  type InheritancePattern,
  type Outcome,
  type ParentStatus,
} from '@/lib/genetics/inheritance';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

/** A catalogue condition, with what the simulator needs to name it. */
export type SimCondition = Pick<CatalogueCondition, 'id' | 'title' | 'aliases' | 'gene' | 'inheritance'> & {
  diseaseLabel: string;
  inheritancePlain: string;
};

type Mine = { id: string; tag: 'result' | 'following' };
type Square = { r: 0 | 1; c: 0 | 1 };
type CopyKind = 'typical' | 'changed' | 'y';

type Props = {
  conditions: SimCondition[];
  /** The person's own conditions (results first, then followed). Offered first, never preselected as parents. */
  mine: Mine[];
  initialConditionId: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Static set-up                                                             */
/* -------------------------------------------------------------------------- */

const PRESETS = [
  { id: 'rec2', pattern: 'autosomal_recessive', p1: 'carrier', p2: 'carrier' },
  { id: 'rec1', pattern: 'autosomal_recessive', p1: 'carrier', p2: 'unaffected' },
  { id: 'dom', pattern: 'autosomal_dominant', p1: 'affected', p2: 'unaffected' },
  { id: 'xl', pattern: 'x_linked', p1: 'carrier', p2: 'unaffected' },
] as const satisfies readonly { id: string; pattern: InheritancePattern; p1: ParentStatus; p2: ParentStatus }[];

const DEFAULTS: Record<InheritancePattern, [ParentStatus, ParentStatus]> = {
  autosomal_recessive: ['carrier', 'carrier'],
  autosomal_dominant: ['affected', 'unaffected'],
  x_linked: ['carrier', 'unaffected'],
};

const OUTCOMES: Outcome[] = ['affected', 'carrier', 'unaffected'];
const TOTAL_RUNS = 100;
const REVEAL_MS = 14;
const PASSING_MS = 700;
const FAMILY_MAX = 12;

const beadClasses: Record<CopyKind, string> = {
  typical: 'bg-bead-typical text-ink',
  changed: 'bg-brand text-ink',
  y: 'bg-info-tint text-info-text',
};
const dotClasses: Record<Outcome, string> = {
  affected: 'bg-affected border-affected',
  carrier: 'bg-brand border-brand',
  unaffected: 'bg-neutral-fill border-neutral-line',
};
const outcomeText: Record<Outcome, string> = {
  affected: 'text-affected',
  carrier: 'text-brand-text',
  unaffected: 'text-unaffected',
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function isPattern(p: unknown): p is InheritancePattern {
  return (patterns as readonly unknown[]).includes(p);
}

function kindOf(a: Allele): CopyKind {
  return a === 'Y' ? 'y' : a === 'a' ? 'changed' : 'typical';
}

/** The letters people see: A/a for recessive, D/d for dominant, X/x/Y for X-linked. */
function letter(pattern: InheritancePattern, a: Allele): string {
  if (pattern === 'x_linked') return a === 'Y' ? 'Y' : a === 'a' ? 'x' : 'X';
  if (pattern === 'autosomal_dominant') return a === 'a' ? 'D' : 'd';
  return a;
}

function genotype(pattern: InheritancePattern, x: Allele, y: Allele): string {
  const rank = (a: Allele) =>
    pattern === 'autosomal_dominant' ? (a === 'a' ? 0 : 1) : a === 'Y' ? 2 : a === 'a' ? 1 : 0;
  return [x, y]
    .sort((m, n) => rank(m) - rank(n))
    .map((a) => letter(pattern, a))
    .join('');
}

function coin(): 0 | 1 {
  return Math.random() < 0.5 ? 0 : 1;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/* -------------------------------------------------------------------------- */
/*  Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function Bead({
  pattern,
  allele,
  state = 'normal',
  size = 'lg',
  pop = false,
}: {
  pattern: InheritancePattern;
  allele: Allele;
  state?: 'normal' | 'chosen' | 'dimmed';
  size?: 'lg' | 'sm';
  pop?: boolean;
}) {
  const t = useTranslations('dashboard.simulator.copies');
  return (
    <span
      role="img"
      aria-label={t('aria', { letter: letter(pattern, allele), kind: kindOf(allele) })}
      className={cn(
        'grid place-items-center rounded-full font-extrabold transition-[translate,opacity,box-shadow] duration-300',
        size === 'lg' ? 'size-13 text-xl' : 'size-6 text-[11px]',
        beadClasses[kindOf(allele)],
        state === 'chosen' && '-translate-y-1.5 shadow-card ring-[3px] ring-ink ring-offset-2',
        state === 'dimmed' && 'opacity-35',
        pop && 'animate-pop',
      )}
    >
      {letter(pattern, allele)}
    </span>
  );
}

function OutcomeDot({ outcome, className }: { outcome: Outcome; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-3.5 shrink-0 rounded-full border', dotClasses[outcome], className)} />;
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function InheritanceSimulator({ conditions, mine, initialConditionId }: Props) {
  const t = useTranslations('dashboard.simulator');
  const tShared = useTranslations('dashboard.shared');

  const byId = useMemo(() => new Map(conditions.map((c) => [c.id, c])), [conditions]);
  const initial = initialConditionId ? byId.get(initialConditionId) ?? null : null;
  const initialPattern: InheritancePattern = isPattern(initial?.inheritance) ? initial.inheritance : 'autosomal_recessive';

  const [conditionId, setConditionId] = useState<string | null>(initial?.id ?? null);
  const [pattern, setPattern] = useState<InheritancePattern>(initialPattern);
  const [status1, setStatus1] = useState<ParentStatus>(DEFAULTS[initialPattern][0]);
  const [status2, setStatus2] = useState<ParentStatus>(DEFAULTS[initialPattern][1]);

  const [pick, setPick] = useState<Square | null>(null);
  const [phase, setPhase] = useState<'idle' | 'passing' | 'done'>('idle');
  const [family, setFamily] = useState<(Square & { n: number })[]>([]);
  const [runs, setRuns] = useState<Outcome[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(false);
  const [hover, setHover] = useState<Square | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  const passTimer = useRef<number | null>(null);
  const runTimer = useRef<number | null>(null);
  const countRef = useRef(0);
  const pickerId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const condition = conditionId ? byId.get(conditionId) ?? null : null;
  /** Complex or unknown patterns aren't simulated: a two-copy model would mislead. */
  const simulatable = !condition || isPattern(condition.inheritance);

  /* ----------------------------- Engine values ---------------------------- */

  const copies1 = parentCopies(pattern, 1, status1);
  const copies2 = parentCopies(pattern, 2, status2);
  const result = calculateInheritance(pattern, status1, status2);
  const expected = expectedCounts(result, TOTAL_RUNS);
  const childAt = (sq: Square): Child => childOf(pattern, copies1[sq.r], copies2[sq.c]);

  /* ------------------------------- Labels -------------------------------- */

  const isX = pattern === 'x_linked';
  const name1 = isX ? t('parentNames.mother') : t('parentNames.p1');
  const name2 = isX ? t('parentNames.father') : t('parentNames.p2');
  const outcomeLabel = (o: Outcome) =>
    o === 'affected' && condition ? t('outcomes.affectedNamed', { name: condition.diseaseLabel }) : t(`outcomes.${o}`);
  const statusLabel = (s: ParentStatus) => t(`status.${s}`);

  /* ------------------------------- Timers -------------------------------- */

  const stopTimers = useCallback(() => {
    if (passTimer.current !== null) window.clearTimeout(passTimer.current);
    if (runTimer.current !== null) window.clearInterval(runTimer.current);
    passTimer.current = null;
    runTimer.current = null;
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  const reset = useCallback(() => {
    stopTimers();
    setPick(null);
    setPhase('idle');
    setFamily([]);
    setRuns([]);
    setRevealed(0);
    setRunning(false);
    countRef.current = 0;
  }, [stopTimers]);

  /* ------------------------------- Changes ------------------------------- */

  const setParents = (p: InheritancePattern, s1: ParentStatus, s2: ParentStatus) => {
    reset();
    setPattern(p);
    setStatus1(s1);
    setStatus2(s2);
  };

  const chooseCondition = (id: string | null) => {
    setPickerOpen(false);
    setQuery('');
    setConditionId(id);
    const next = id ? byId.get(id) : null;
    const p = next && isPattern(next.inheritance) ? next.inheritance : next ? pattern : 'autosomal_recessive';
    setParents(p, DEFAULTS[p][0], DEFAULTS[p][1]);
    // Keep the address shareable and in step with the links that open this page.
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('condition', id);
    else url.searchParams.delete('condition');
    window.history.replaceState(null, '', url);
  };

  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus();
  }, [pickerOpen]);

  /* ------------------------------ Simulation ----------------------------- */

  const simulateOne = () => {
    if (running || phase === 'passing') return;
    const sq: Square = { r: coin(), c: coin() };
    setPick(sq);
    countRef.current += 1;
    const entry = { ...sq, n: countRef.current };
    const finish = () => {
      setPhase('done');
      setFamily((f) => [...f, entry].slice(-FAMILY_MAX));
    };
    void logSimulatorRun(pattern, 1).catch(() => {});
    if (reducedMotion()) return finish();
    setPhase('passing');
    passTimer.current = window.setTimeout(finish, PASSING_MS);
  };

  const runMany = () => {
    if (running) return;
    stopTimers();
    const results = Array.from({ length: TOTAL_RUNS }, () => childAt({ r: coin(), c: coin() }).outcome);
    setRuns(results);
    void logSimulatorRun(pattern, TOTAL_RUNS).catch(() => {});
    if (reducedMotion()) {
      setRevealed(TOTAL_RUNS);
      return;
    }
    setRevealed(0);
    setRunning(true);
    let shown = 0;
    runTimer.current = window.setInterval(() => {
      shown += 1;
      setRevealed(shown);
      if (shown >= TOTAL_RUNS) {
        if (runTimer.current !== null) window.clearInterval(runTimer.current);
        runTimer.current = null;
        setRunning(false);
      }
    }, REVEAL_MS);
  };

  const counts = useMemo(() => {
    const c: Record<Outcome, number> = { affected: 0, carrier: 0, unaffected: 0 };
    for (let i = 0; i < revealed; i += 1) c[runs[i]] += 1;
    return c;
  }, [runs, revealed]);

  /* --------------------------- Bead highlighting -------------------------- */

  // Hovering a square lights up the two copies that make it; otherwise the
  // last simulated pregnancy does.
  const focus = hover ?? (phase !== 'idle' ? pick : null);
  const beadState = (parent: 1 | 2, i: number): 'normal' | 'chosen' | 'dimmed' => {
    if (!focus) return 'normal';
    return (parent === 1 ? focus.r : focus.c) === i ? 'chosen' : 'dimmed';
  };

  /* --------------------------------- Listen ------------------------------- */

  const listenText = [
    t('listen.intro'),
    condition && !simulatable
      ? `${t('condition.complexTitle', { name: condition.title })} ${t('condition.complexBody')}`
      : t('listen.summary', {
          pattern: condition ? `${condition.title}, ${t(`patternNames.${pattern}`)}` : t(`patternNames.${pattern}`),
          parent1: name1,
          status1: statusLabel(status1),
          parent2: name2,
          status2: statusLabel(status2),
          affected: result.chances.affected,
          carrier: result.chances.carrier,
          unaffected: result.chances.unaffected,
          affectedLabel: condition ? t('listen.hasNamed', { name: condition.diseaseLabel }) : t('listen.has'),
        }),
  ].join(' ');

  /* -------------------------------- Picker -------------------------------- */

  const mineIds = new Set(mine.map((m) => m.id));
  const matches = searchConditions(query, conditions);
  const mineMatches = mine
    .map((m) => ({ ...m, c: byId.get(m.id) }))
    .filter((m): m is Mine & { c: SimCondition } => Boolean(m.c) && matches.includes(m.c!));
  const otherMatches = matches.filter((c) => !mineIds.has(c.id));
  const tagFor = (id: string) => mine.find((m) => m.id === id)?.tag;

  const presets = PRESETS.filter((p) => !condition || p.pattern === pattern);

  /* -------------------------------- Render -------------------------------- */

  const card = cn(cardClasses, 'p-6');
  const pickedChild = pick ? childAt(pick) : null;
  const hasAffectedSquare = result.chances.affected > 0;

  return (
    <main className="min-w-0 flex-1 px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-2">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('header.title')}</h1>
          <p className="text-[15px] text-muted">{t('header.subtitle')}</p>
        </div>
        <ListenPill text={listenText} play={tShared('listen')} stop={t('header.stop')} />
      </header>

      {/* Quick examples (design presets) */}
      {simulatable && (
        <div role="group" aria-label={t('presets.label')} className="mt-6 flex flex-wrap gap-2.5">
          {presets.map((p) => {
            const active = p.pattern === pattern && p.p1 === status1 && p.p2 === status2;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => setParents(p.pattern, p.p1, p.p2)}
                className={cn(
                  'min-h-11 cursor-pointer rounded-full border px-5 text-sm font-bold transition-colors',
                  active ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink hover:bg-brand-tint-soft',
                )}
              >
                {t(`presets.${p.id}`)}
              </button>
            );
          })}
        </div>
      )}

      {/* Condition bar */}
      <section className="mt-5 rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
          <p className="min-w-0 text-[15px]">
            {condition ? (
              <>
                <strong className="font-extrabold">{condition.title}</strong>
                {condition.gene && <span className="text-muted"> ({condition.gene})</span>}
                {simulatable && <span className="text-muted"> · {t(`patternNames.${pattern}`)}</span>}
                {tagFor(condition.id) && (
                  <span className="ms-2 inline-block rounded-full bg-brand-tint px-2.5 py-0.5 align-middle text-xs font-bold text-brand-text-dark">
                    {tagFor(condition.id) === 'result' ? t('condition.inResults') : t('condition.following')}
                  </span>
                )}
              </>
            ) : (
              <>
                <strong className="font-extrabold">{t(`patternNames.${pattern}`)}</strong> · {t(`examples.${pattern}`)}
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {condition && (
              <>
                <Link href={conditionGuideHref(condition.id)} className="text-sm font-bold text-brand-text underline underline-offset-2">
                  {t('condition.guide')}
                </Link>
                <button
                  type="button"
                  onClick={() => chooseCondition(null)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-sm font-bold text-muted underline underline-offset-2"
                >
                  <X aria-hidden="true" className="size-4" />
                  {t('condition.clear')}
                </button>
              </>
            )}
            <button
              type="button"
              aria-expanded={pickerOpen}
              aria-controls={pickerId}
              onClick={() => setPickerOpen((o) => !o)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-sm font-bold text-brand-text underline underline-offset-2"
            >
              {condition ? t('condition.change') : t('findCondition')}
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', pickerOpen && 'rotate-180')} />
            </button>
          </div>
        </div>

        {/* Condition picker */}
        {pickerOpen && (
          <div
            id={pickerId}
            className="border-t border-line px-5 py-4"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPickerOpen(false);
            }}
          >
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('condition.search')}
                aria-label={t('condition.searchLabel')}
                className="min-h-12 w-full rounded-input border border-line-strong bg-surface ps-12 pe-4 text-[15px] outline-none focus-visible:border-brand-text focus-visible:ring-2 focus-visible:ring-brand-ring"
              />
            </div>
            <div className="mt-4 flex max-h-80 flex-col gap-4 overflow-auto">
              {mineMatches.length > 0 && (
                <ConditionGroup title={t('condition.mine')}>
                  {mineMatches.map((m) => (
                    <ConditionOption
                      key={m.id}
                      c={m.c}
                      selected={m.id === conditionId}
                      tag={m.tag === 'result' ? t('condition.inResults') : t('condition.following')}
                      patternName={isPattern(m.c.inheritance) ? t(`patternNames.${m.c.inheritance}`) : null}
                      onPick={() => chooseCondition(m.id)}
                    />
                  ))}
                </ConditionGroup>
              )}
              {otherMatches.length > 0 && (
                <ConditionGroup title={t('condition.all')}>
                  {otherMatches.map((c) => (
                    <ConditionOption
                      key={c.id}
                      c={c}
                      selected={c.id === conditionId}
                      patternName={isPattern(c.inheritance) ? t(`patternNames.${c.inheritance}`) : null}
                      onPick={() => chooseCondition(c.id)}
                    />
                  ))}
                </ConditionGroup>
              )}
              {matches.length === 0 && <p className="text-sm text-muted">{t('condition.empty', { q: query })}</p>}
            </div>
          </div>
        )}
      </section>

      {/* How the pattern works, and the not-a-diagnosis line */}
      <div className="mt-3 flex flex-col gap-1.5 px-1">
        {simulatable && (
          <p className="text-[15px] leading-relaxed">
            {condition?.inheritancePlain || t(`how.${pattern}`)}
          </p>
        )}
        <p className="text-sm text-muted">{t('notDiagnosis')}</p>
      </div>

      {!simulatable && condition ? (
        <section className={cn(card, 'mt-5 flex flex-col items-center gap-3 py-12 text-center')}>
          <h2 className="text-xl font-extrabold tracking-[-0.01em]">{t('condition.complexTitle', { name: condition.title })}</h2>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted">{t('condition.complexBody')}</p>
          <Link href="/dashboard/counsellor" className={buttonClasses('primary', 'md', 'mt-2')}>
            {t('condition.complexCta')}
          </Link>
        </section>
      ) : (
        <>
          {/* Counsellor note for dominant and X-linked (design) */}
          {pattern !== 'autosomal_recessive' && (
            <p className="mt-5 flex items-start gap-3 rounded-card bg-brand-tint-soft px-5 py-4 text-[15px]">
              <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-text" />
              <span>
                {t(`counsellorNote.${pattern}`)}{' '}
                <Link href="/dashboard/counsellor" className="font-bold text-brand-text underline underline-offset-2">
                  {t('counsellorNote.link')}
                </Link>
              </span>
            </p>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {/* Stage: parents → child */}
            <section aria-label={t('buttons.simulateOne')} className={cn(card, 'flex flex-col items-center')}>
              <div className="grid w-full gap-6 sm:grid-cols-2">
                {([1, 2] as const).map((parent) => {
                  const copies = parent === 1 ? copies1 : copies2;
                  const status = parent === 1 ? status1 : status2;
                  const name = parent === 1 ? name1 : name2;
                  const setStatus = (s: ParentStatus) =>
                    parent === 1 ? setParents(pattern, s, status2) : setParents(pattern, status1, s);
                  return (
                    <div key={parent} className="flex flex-col items-center gap-3">
                      <h3 className="text-base font-extrabold">{name}</h3>
                      <div className="flex gap-2">
                        {copies.map((a, i) => (
                          <Bead key={i} pattern={pattern} allele={a} state={beadState(parent, i)} />
                        ))}
                      </div>
                      <div
                        role="radiogroup"
                        aria-label={t('status.label', { parent: name })}
                        className="flex flex-wrap justify-center gap-1.5"
                      >
                        {statusesFor(pattern, parent).map((s) => (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={s === status}
                            disabled={running}
                            onClick={() => s !== status && setStatus(s)}
                            className={cn(
                              'min-h-11 cursor-pointer rounded-full border px-3.5 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                              s === status
                                ? 'border-brand-text bg-brand-tint text-brand-text-dark'
                                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
                            )}
                          >
                            {statusLabel(s)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Key */}
              <ul className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-muted">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-3 rounded-full bg-bead-typical" />
                  {t('copies.typical')}
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-3 rounded-full bg-brand" />
                  {t('copies.changed')}
                </li>
                {isX && (
                  <li className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-3 rounded-full bg-info-tint" />
                    {t('copies.y')}
                  </li>
                )}
              </ul>

              <ArrowDown aria-hidden="true" className={cn('mt-4 size-6 text-neutral-line', phase === 'passing' && 'animate-bounce')} />

              {/* One pregnancy */}
              <div
                aria-live="polite"
                className="mt-3 flex min-h-36 w-full max-w-md flex-col items-center justify-center gap-2.5 rounded-card bg-brand-tint-soft px-6 py-5 text-center"
              >
                {phase === 'idle' || !pick || !pickedChild ? (
                  <p className="text-[15px] leading-relaxed text-muted">
                    {t('single.empty', { button: t('buttons.simulateOne') })}
                  </p>
                ) : phase === 'passing' ? (
                  <p className="text-[15px] leading-relaxed text-muted">{t('single.passing')}</p>
                ) : (
                  <>
                    <div key={`${family.length}-${pick.r}${pick.c}`} className="flex gap-2">
                      <Bead pattern={pattern} allele={copies1[pick.r]} pop />
                      <Bead pattern={pattern} allele={copies2[pick.c]} pop />
                    </div>
                    <p className={cn('text-base font-extrabold', outcomeText[pickedChild.outcome])}>
                      {t('single.sentence', {
                        sex: pickedChild.sex ?? 'other',
                        outcome: pickedChild.outcome,
                        name: condition?.diseaseLabel ?? t('single.theCondition'),
                      })}
                    </p>
                    <ul className="flex flex-col gap-0.5 text-[13px] text-muted">
                      {(
                        [
                          [name1, copies1[pick.r]],
                          [name2, copies2[pick.c]],
                        ] as const
                      ).map(([parentName, a]) => (
                        <li key={parentName}>
                          {t('single.passed', { parent: parentName, kind: kindOf(a), letter: letter(pattern, a) })}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[13px] font-bold">{t('single.same')}</p>
                  </>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                <button type="button" onClick={simulateOne} disabled={running || phase === 'passing'} className={buttonClasses('primary', 'sm', 'disabled:cursor-not-allowed disabled:opacity-60')}>
                  {t('buttons.simulateOne')}
                </button>
                <button type="button" onClick={runMany} disabled={running} className={buttonClasses('dark', 'sm', 'disabled:cursor-not-allowed disabled:opacity-60')}>
                  {runs.length ? t('buttons.runAgain', { count: TOTAL_RUNS }) : t('buttons.runMany', { count: TOTAL_RUNS })}
                </button>
                <button type="button" onClick={reset} className={buttonClasses('ghost', 'sm')}>
                  {t('buttons.reset')}
                </button>
              </div>

              {/* Pregnancies so far: shows each one is independent */}
              {family.length > 0 && (
                <div className="mt-6 w-full border-t border-line pt-5">
                  <h3 className="text-sm font-extrabold">{t('family.title')}</h3>
                  <ol className="mt-3 flex flex-wrap gap-2">
                    {family.map((f) => {
                      const child = childAt(f);
                      const g = genotype(pattern, copies1[f.r], copies2[f.c]);
                      return (
                        <li
                          key={f.n}
                          aria-label={t('family.child', { n: f.n, genotype: g, label: outcomeLabel(child.outcome) })}
                          className="flex w-16 animate-pop flex-col items-center gap-1 rounded-tile border border-line bg-surface px-1.5 py-2"
                        >
                          <span aria-hidden="true" className="text-[11px] text-muted tabular-nums">
                            {f.n}
                          </span>
                          <span aria-hidden="true" className="flex gap-0.5">
                            <Bead pattern={pattern} allele={copies1[f.r]} size="sm" />
                            <Bead pattern={pattern} allele={copies2[f.c]} size="sm" />
                          </span>
                          <span aria-hidden="true" className={cn('text-center text-[11px] leading-tight font-bold', outcomeText[child.outcome])}>
                            {child.sex ? `${t(`sex.${child.sex}`)} · ` : ''}
                            {t(`short.${child.outcome}`)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="mt-3 text-[13px] text-muted">{t('family.note')}</p>
                </div>
              )}
            </section>

            <div className="flex flex-col gap-5">
              {/* Punnett square */}
              <section aria-labelledby="combos-title" className={card}>
                <h2 id="combos-title" className="text-xl font-extrabold tracking-[-0.01em]">
                  {t('punnett.title')}
                </h2>
                <p className="mt-1 text-[13px] text-muted">{t('punnett.axes', { p1: name1, p2: name2 })}</p>
                <div
                  role="group"
                  aria-label={t('punnett.aria')}
                  className="mt-5 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
                  onMouseLeave={() => setHover(null)}
                >
                  <span aria-hidden="true" />
                  {copies2.map((a, c) => (
                    <div key={c} className="flex justify-center py-1">
                      <Bead pattern={pattern} allele={a} size="sm" state={focus ? (focus.c === c ? 'chosen' : 'dimmed') : 'normal'} />
                    </div>
                  ))}
                  {copies1.map((rowAllele, r) => (
                    <PunnettRow
                      key={r}
                      r={r as 0 | 1}
                      rowAllele={rowAllele}
                      cols={copies2}
                      pattern={pattern}
                      focus={focus}
                      picked={phase === 'done' ? pick : null}
                      childAt={childAt}
                      outcomeLabel={outcomeLabel}
                      onHover={setHover}
                    />
                  ))}
                </div>
                <p className="mt-4 min-h-10 text-[13px] leading-relaxed">
                  {focus
                    ? t('punnett.explain', {
                        a: letter(pattern, copies1[focus.r]),
                        b: letter(pattern, copies2[focus.c]),
                        p1: name1,
                        p2: name2,
                        outcome: outcomeLabel(childAt(focus).outcome),
                      })
                    : <span className="text-muted">{t('punnett.hint')}</span>}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  {!hasAffectedSquare ? t('punnett.noteNone') : isX ? t('punnett.noteX') : t('punnett.note')}
                </p>
              </section>

              {/* Chances for each pregnancy (engine numbers, never animated) */}
              <section aria-labelledby="chances-title" className={card}>
                <h2 id="chances-title" className="text-xl font-extrabold tracking-[-0.01em]">
                  {t('chances.title')}
                </h2>
                <div className="mt-4 flex flex-col gap-4">
                  {(result.bySex
                    ? ([
                        [t('chances.son'), result.bySex.son],
                        [t('chances.daughter'), result.bySex.daughter],
                      ] as const)
                    : ([[null, result.chances]] as const)
                  ).map(([label, chances]) => (
                    <div key={label ?? 'all'} className="flex flex-col gap-2">
                      {label && <h3 className="text-sm font-bold">{label}</h3>}
                      <div
                        role="img"
                        aria-label={t('chances.aria', {
                          affected: chances.affected,
                          carrier: chances.carrier,
                          unaffected: chances.unaffected,
                          affectedLabel: outcomeLabel('affected'),
                        })}
                        className="flex h-4 w-full overflow-hidden rounded-full bg-line"
                      >
                        {OUTCOMES.filter((o) => chances[o] > 0).map((o) => (
                          <span key={o} className={cn('h-full border-e-2 border-surface last:border-e-0', dotClasses[o])} style={{ inlineSize: `${chances[o]}%` }} />
                        ))}
                      </div>
                      <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                        {OUTCOMES.filter((o) => chances[o] > 0).map((o) => (
                          <li key={o} className="flex items-center gap-1.5">
                            <OutcomeDot outcome={o} className="size-3" />
                            <span>
                              <strong className="font-extrabold tabular-nums">{chances[o]}%</strong> {outcomeLabel(o)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[13px] font-bold">{t('chances.same')}</p>
              </section>
            </div>
          </div>

          {/* 100 pregnancies */}
          <section aria-labelledby="many-title" className={cn(card, 'mt-5')}>
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
              <div>
                <h2 id="many-title" className="text-xl font-extrabold tracking-[-0.01em]">
                  {t('many.title', { count: TOTAL_RUNS })}
                </h2>
                <p className="mt-2 text-[15px] text-muted">
                  {runs.length ? t('many.after') : t('many.description', { count: TOTAL_RUNS })}
                </p>
                <ul className="mt-4 flex flex-col gap-3" aria-live="polite">
                  {OUTCOMES.filter((o) => !(o === 'carrier' && pattern === 'autosomal_dominant')).map((o) => (
                    <li key={o} className="flex flex-col gap-1.5">
                      <div className="grid grid-cols-[14px_minmax(0,1fr)_36px_auto] items-center gap-2.5 text-[15px]">
                        <OutcomeDot outcome={o} />
                        <span>{outcomeLabel(o)}</span>
                        <span className="text-end font-extrabold tabular-nums">{counts[o]}</span>
                        <span className="text-[13px] text-muted">{t('many.expected', { n: expected[o] })}</span>
                      </div>
                      {/* Count against expected: the tick marks what the chances predict */}
                      <div aria-hidden="true" className="relative ms-6 h-1.5 rounded-full bg-bead-typical">
                        <span className={cn('absolute inset-y-0 start-0 rounded-full', o === 'unaffected' ? 'bg-neutral-line' : dotClasses[o])} style={{ inlineSize: `${counts[o]}%` }} />
                        {expected[o] > 0 && (
                          <span className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" style={{ insetInlineStart: `${expected[o]}%` }} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[15px] font-bold">{t('many.disclaimer')}</p>
              </div>

              <div
                role="img"
                aria-label={t('many.aria', {
                  revealed,
                  total: TOTAL_RUNS,
                  affected: counts.affected,
                  carrier: counts.carrier,
                  unaffected: counts.unaffected,
                  affectedLabel: outcomeLabel('affected'),
                })}
                className="grid w-full grid-cols-10 gap-1.5 justify-self-end"
              >
                {Array.from({ length: TOTAL_RUNS }, (_, i) =>
                  i < revealed ? (
                    <span key={`${runs.length}-${i}`} className={cn('aspect-square animate-pop rounded-full border', dotClasses[runs[i]])} />
                  ) : (
                    <span key={i} className="aspect-square rounded-full border border-line-strong bg-surface" />
                  ),
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Punnett row                                                               */
/* -------------------------------------------------------------------------- */

function PunnettRow({
  r,
  rowAllele,
  cols,
  pattern,
  focus,
  picked,
  childAt,
  outcomeLabel,
  onHover,
}: {
  r: 0 | 1;
  rowAllele: Allele;
  cols: [Allele, Allele];
  pattern: InheritancePattern;
  focus: Square | null;
  picked: Square | null;
  childAt: (sq: Square) => Child;
  outcomeLabel: (o: Outcome) => string;
  onHover: (sq: Square | null) => void;
}) {
  const t = useTranslations('dashboard.simulator');
  return (
    <>
      <div className="flex justify-center px-1">
        <Bead pattern={pattern} allele={rowAllele} size="sm" state={focus ? (focus.r === r ? 'chosen' : 'dimmed') : 'normal'} />
      </div>
      {cols.map((colAllele, c) => {
        const sq: Square = { r, c: c as 0 | 1 };
        const child = childAt(sq);
        const g = genotype(pattern, rowAllele, colAllele);
        const isPicked = picked?.r === r && picked?.c === c;
        const isFocus = focus?.r === r && focus?.c === c;
        return (
          <button
            key={c}
            type="button"
            onMouseEnter={() => onHover(sq)}
            onFocus={() => onHover(sq)}
            onBlur={() => onHover(null)}
            onClick={() => onHover(isFocus ? null : sq)}
            aria-label={t('punnett.cell', { genotype: g, outcome: outcomeLabel(child.outcome), picked: isPicked ? 'yes' : 'no' })}
            className={cn(
              'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-tile px-1 transition-[box-shadow,background-color]',
              child.outcome === 'affected' ? 'bg-affected-tint' : 'bg-bead-typical/60',
              isFocus && 'ring-2 ring-ink',
              isPicked && 'ring-[3px] ring-ink ring-offset-2',
            )}
          >
            <span className="text-lg font-extrabold">{g}</span>
            <span className={cn('text-center text-[11px] leading-tight font-bold', outcomeText[child.outcome])}>
              {child.sex ? `${t(`sex.${child.sex}`)} · ` : ''}
              {t(`short.${child.outcome}`)}
            </span>
          </button>
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Picker pieces                                                             */
/* -------------------------------------------------------------------------- */

function ConditionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{title}</h3>
      <ul className="grid gap-2 sm:grid-cols-2">{children}</ul>
    </div>
  );
}

function ConditionOption({
  c,
  selected,
  tag,
  patternName,
  onPick,
}: {
  c: SimCondition;
  selected: boolean;
  tag?: string;
  patternName: string | null;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onPick}
        className={cn(
          'flex min-h-14 w-full cursor-pointer flex-col items-start gap-0.5 rounded-input border px-4 py-2.5 text-start transition-colors',
          selected ? 'border-ink bg-brand-tint-soft' : 'border-line bg-surface hover:border-line-strong hover:bg-brand-tint-soft',
        )}
      >
        <span className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
          {c.title}
          {tag && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold text-brand-text-dark">{tag}</span>}
        </span>
        <span className="text-[13px] text-muted">
          {[c.gene, patternName].filter(Boolean).join(' · ')}
        </span>
      </button>
    </li>
  );
}
