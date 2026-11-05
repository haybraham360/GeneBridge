"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Square, Volume1 } from "lucide-react";
import { calculateInheritance, type ParentStatus } from "@/lib/genetics/inheritance";

/* -------------------------------------------------------------------------- */
/*  Types & static content                                                    */
/* -------------------------------------------------------------------------- */

type Allele = "A" | "S";
type OutcomeKey = "scd" | "carrier" | "none";
type PatternId = "both" | "one" | "xlinked";

interface Pattern {
  id: Exclude<PatternId, "xlinked">;
  label: string;
  parent1: [Allele, Allele];
  parent2: [Allele, Allele];
  parent1Label: string;
  parent2Label: string;
  expected: Record<OutcomeKey, number>;
}

interface SingleResult {
  row: 0 | 1; // allele index taken from parent 1
  col: 0 | 1; // allele index taken from parent 2
  alleles: [Allele, Allele];
  outcome: OutcomeKey;
}

/** Expected chances come from the shared inheritance engine (lib/genetics). */
function expectedFor(p1: ParentStatus, p2: ParentStatus): Record<OutcomeKey, number> {
  const { chances } = calculateInheritance("autosomal_recessive", p1, p2);
  return { scd: chances.affected, carrier: chances.carrier, none: chances.unaffected };
}

const PATTERNS: Pattern[] = [
  {
    id: "both",
    label: "Both parents carriers (AS × AS)",
    parent1: ["A", "S"],
    parent2: ["A", "S"],
    parent1Label: "Carrier (AS)",
    parent2Label: "Carrier (AS)",
    expected: expectedFor("carrier", "carrier"),
  },
  {
    id: "one",
    label: "One parent carrier (AS × AA)",
    parent1: ["A", "S"],
    parent2: ["A", "A"],
    parent1Label: "Carrier (AS)",
    parent2Label: "Not a carrier (AA)",
    expected: expectedFor("carrier", "unaffected"),
  },
];

const XLINKED_LABEL = "X-linked: talk to a counsellor";

const OUTCOME_META: Record<
  OutcomeKey,
  { label: string; dot: string; sentence: string }
> = {
  scd: {
    label: "Sickle cell disease",
    dot: "bg-[#9f1239] border-[#9f1239]",
    sentence: "This child has sickle cell disease (SS).",
  },
  carrier: {
    label: "Healthy carrier",
    dot: "bg-[#ff5a1f] border-[#ff5a1f]",
    sentence: "This child is a healthy carrier (AS).",
  },
  none: {
    label: "No changed copy",
    dot: "bg-[#e9e2db] border-[#e9e2db]",
    sentence: "This child has no changed copy (AA).",
  },
};

const OUTCOME_ORDER: OutcomeKey[] = ["scd", "carrier", "none"];
const TOTAL_RUNS = 100;
const REVEAL_INTERVAL_MS = 14;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function outcomeFor(a: Allele, b: Allele): OutcomeKey {
  const changed = (a === "S" ? 1 : 0) + (b === "S" ? 1 : 0);
  return changed === 2 ? "scd" : changed === 1 ? "carrier" : "none";
}

function coinFlip(): 0 | 1 {
  return Math.random() < 0.5 ? 0 : 1;
}

function simulateOnce(p: Pattern): SingleResult {
  const row = coinFlip();
  const col = coinFlip();
  const alleles: [Allele, Allele] = [p.parent1[row], p.parent2[col]];
  return { row, col, alleles, outcome: outcomeFor(alleles[0], alleles[1]) };
}

function cellLabel(a: Allele, b: Allele): string {
  return [a, b].sort().join("");
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/* -------------------------------------------------------------------------- */
/*  Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function AlleleCircle({ allele }: { allele: Allele }) {
  return (
    <span
      className={`grid size-10 place-items-center rounded-full text-[15px] font-bold text-[#16110d] ${
        allele === "S" ? "bg-[#ff5a1f]" : "bg-[#ece6e0]"
      }`}
    >
      {allele}
    </span>
  );
}

function ParentBlock({
  title,
  alleles,
  caption,
}: {
  title: string;
  alleles: [Allele, Allele];
  caption: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <h3 className="text-[13px] font-bold">{title}</h3>
      <div className="mt-2.5 flex gap-1.5">
        <AlleleCircle allele={alleles[0]} />
        <AlleleCircle allele={alleles[1]} />
      </div>
      <p className="mt-2 text-[11px] text-[#6b6159]">{caption}</p>
    </div>
  );
}

const pillBase =
  "rounded-full border px-4 py-2 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]";

function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#16110d] px-4 py-2 text-sm font-medium text-white shadow-lg"
    >
      {message}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export interface InheritanceSimulatorProps {
  /** BCP-47 tag used by the "Listen" speech synthesis. */
  lang?: string;
  /** Called from the X-linked panel. Falls back to a toast when omitted. */
  onBookCounsellor?: () => void;
}

export default function InheritanceSimulator({
  lang = "en",
  onBookCounsellor,
}: InheritanceSimulatorProps) {
  const [patternId, setPatternId] = useState<PatternId>("both");
  const [single, setSingle] = useState<SingleResult | null>(null);
  const [runs, setRuns] = useState<OutcomeKey[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(false);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const pattern = useMemo(
    () => PATTERNS.find((p) => p.id === patternId) ?? null,
    [patternId],
  );

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    setSingle(null);
    setRuns([]);
    setRevealed(0);
    setRunning(false);
  }, [stopTimer]);

  // Cleanup timers and speech on unmount.
  useEffect(() => {
    return () => {
      stopTimer();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopTimer]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const selectPattern = (id: PatternId) => {
    if (id === patternId) return;
    reset();
    setPatternId(id);
  };

  const simulateOne = () => {
    if (!pattern || running) return;
    setSingle(simulateOnce(pattern));
  };

  const runHundred = () => {
    if (!pattern || running) return;
    stopTimer();
    const results = Array.from({ length: TOTAL_RUNS }, () => simulateOnce(pattern).outcome);
    setRuns(results);

    if (prefersReducedMotion()) {
      setRevealed(TOTAL_RUNS);
      return;
    }

    setRevealed(0);
    setRunning(true);
    let shown = 0;
    timerRef.current = window.setInterval(() => {
      shown += 1;
      setRevealed(shown);
      if (shown >= TOTAL_RUNS) {
        stopTimer();
        setRunning(false);
      }
    }, REVEAL_INTERVAL_MS);
  };

  const counts = useMemo(() => {
    const c: Record<OutcomeKey, number> = { scd: 0, carrier: 0, none: 0 };
    for (let i = 0; i < revealed; i += 1) c[runs[i]] += 1;
    return c;
  }, [runs, revealed]);

  /* ----------------------------- Listen (TTS) ---------------------------- */

  const spokenText = useMemo(() => {
    const intro =
      "Inheritance simulator. See how gene copies pass from parents to a child. This shows chances, not what will happen.";
    if (!pattern) {
      return `${intro} X-linked conditions follow a different inheritance pattern. Talk to a counsellor to understand your family's chances.`;
    }
    const expected = pattern.expected;
    const combos = `Pattern: ${pattern.label}. Each pregnancy has a ${expected.scd} percent chance of sickle cell disease, ${expected.carrier} percent of a healthy carrier, and ${expected.none} percent of no changed copy.`;
    return `${intro} ${combos}`;
  }, [pattern]);

  const toggleListen = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setToast("Listening isn't supported in this browser.");
      return;
    }
    const synth = window.speechSynthesis;
    if (listening) {
      synth.cancel();
      setListening(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = lang;
    utterance.onend = () => setListening(false);
    utterance.onerror = () => setListening(false);
    synth.cancel();
    synth.speak(utterance);
    setListening(true);
  };

  const bookCounsellor = () => {
    if (onBookCounsellor) onBookCounsellor();
    else setToast("Opening couple session booking…");
  };

  /* -------------------------------- Render -------------------------------- */

  const cardClass =
    "rounded-3xl border border-[#f6e9df] bg-white shadow-[0_1px_2px_rgba(120,60,20,0.04),0_8px_28px_rgba(120,60,20,0.05)]";

  return (
    <div className="min-h-screen bg-[#fff6f0] px-6 py-6 font-['Plus_Jakarta_Sans',ui-sans-serif,system-ui,sans-serif] text-[#16110d] antialiased">
      <div className="mx-auto">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
              Inheritance simulator
            </h1>
            <p className="mt-1 text-[13px] text-[#6b6159]">
              See how gene copies pass from parents to a child. This shows
              chances, not what will happen.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleListen}
            aria-pressed={listening}
            className="inline-flex items-center gap-2 rounded-full border border-[#f0e2d8] bg-white px-5 py-2.5 text-sm font-semibold shadow-[0_1px_2px_rgba(120,60,20,0.05)] transition hover:border-[#e8c9b4] hover:bg-[#fffaf6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
          >
            {listening ? (
              <Square className="size-3.5 fill-current" aria-hidden />
            ) : (
              <Volume1 className="size-4" aria-hidden />
            )}
            {listening ? "Stop" : "Listen"}
          </button>
        </header>

        {/* Pattern selector */}
        <div
          role="group"
          aria-label="Pattern"
          className="mt-5 flex flex-wrap items-center gap-2"
        >
          <span className="mr-1 text-xs font-bold">Pattern</span>
          {PATTERNS.map((p) => {
            const active = p.id === patternId;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectPattern(p.id)}
                className={`${pillBase} cursor-pointer ${
                  active
                    ? "border-[#16110d] bg-[#16110d] text-white"
                    : "border-[#f0e2d8] bg-white text-[#16110d] hover:border-[#e0c3ad]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={patternId === "xlinked"}
            onClick={() => selectPattern("xlinked")}
            className={`${pillBase} cursor-pointer ${
              patternId === "xlinked"
                ? "border-[#16110d] bg-[#16110d] text-white"
                : "border-dashed border-[#e6d6c9] bg-transparent text-[#6b6159] hover:border-[#d2b8a4]"
            }`}
          >
            {XLINKED_LABEL}
          </button>
        </div>

        {pattern ? (
          <>
            {/* Top row */}
            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_326px]">
              {/* Simulator card */}
              <section aria-label="Simulate a pregnancy" className={`${cardClass} p-6`}>
                <div className="flex items-start justify-center gap-10">
                  <ParentBlock
                    title="Parent 1"
                    alleles={pattern.parent1}
                    caption={pattern.parent1Label}
                  />
                  <ParentBlock
                    title="Parent 2"
                    alleles={pattern.parent2}
                    caption={pattern.parent2Label}
                  />
                </div>

                <div className="mt-4 flex justify-center">
                  <ArrowDown className="size-5 text-[#b8aca2]" aria-hidden />
                </div>

                <div
                  aria-live="polite"
                  className="mx-auto mt-4 flex min-h-26 max-w-68.5 flex-col items-center justify-center gap-2.5 rounded-3xl bg-[#fff3ea] px-6 py-5 text-center"
                >
                  {single ? (
                    <>
                      <div className="flex gap-1.5">
                        <AlleleCircle allele={single.alleles[0]} />
                        <AlleleCircle allele={single.alleles[1]} />
                      </div>
                      <p className="text-[13px] font-bold">
                        {OUTCOME_META[single.outcome].sentence}
                      </p>
                      <p className="text-[11px] text-[#6b6159]">
                        {single.alleles[0]} from Parent 1, {single.alleles[1]}{" "}
                        from Parent 2
                      </p>
                    </>
                  ) : (
                    <p className="text-xs leading-relaxed text-[#6b6159]">
                      Press &ldquo;Simulate one pregnancy&rdquo; to see one
                      possible result.
                    </p>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={simulateOne}
                    disabled={running}
                    className="rounded-full bg-[#ff5a1f] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#ea4c12] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
                  >
                    Simulate one pregnancy
                  </button>
                  <button
                    type="button"
                    onClick={runHundred}
                    disabled={running}
                    className="rounded-full bg-[#16110d] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#2c2420] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
                  >
                    Run 100 times
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-full border border-[#f0e2d8] bg-white px-5 py-2.5 text-xs font-bold transition hover:border-[#e0c3ad] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
                  >
                    Reset
                  </button>
                </div>
              </section>

              {/* Combinations card */}
              <section aria-labelledby="combos-title" className={`${cardClass} p-6`}>
                <h2 id="combos-title" className="text-base font-bold tracking-tight">
                  All possible combinations
                </h2>

                <div
                  role="table"
                  aria-label="Punnett square"
                  className="mt-5 grid grid-cols-[56px_1fr_1fr] items-center gap-2"
                >
                  <div />
                  {pattern.parent2.map((a, i) => (
                    <div
                      key={`col-${i}`}
                      role="columnheader"
                      className="py-1 text-center text-[13px] font-bold"
                    >
                      {a}
                    </div>
                  ))}

                  {pattern.parent1.map((rowAllele, r) => (
                    <PunnettRow
                      key={`row-${r}`}
                      rowAllele={rowAllele}
                      rowIndex={r}
                      cols={pattern.parent2}
                      highlight={single}
                    />
                  ))}
                </div>

                <p className="mt-4 text-[11px] leading-relaxed text-[#6b6159]">
                  Each square is one of four equally likely combinations.{" "}
                  {pattern.expected.scd > 0
                    ? "A shaded square means two changed copies (sickle cell disease)."
                    : "No square has two changed copies, so sickle cell disease is not possible in this pattern."}
                </p>
              </section>
            </div>

            {/* 100 pregnancies */}
            <section
              aria-labelledby="hundred-title"
              className={`${cardClass} mt-4 p-6`}
            >
              <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <h2
                    id="hundred-title"
                    className="text-base font-bold tracking-tight"
                  >
                    100 pregnancies
                  </h2>
                  <p className="mt-2 text-[13px] text-[#6b6159]">
                    Run 100 pregnancies to see how the chances add up over many
                    families.
                  </p>

                  <ul className="mt-3 space-y-2.5" aria-live="polite">
                    {OUTCOME_ORDER.map((key) => (
                      <li
                        key={key}
                        className="grid grid-cols-[14px_minmax(0,1fr)_32px_auto] items-center gap-2.5 text-[13px]"
                      >
                        <span
                          className={`size-3.5 rounded-full border ${OUTCOME_META[key].dot}`}
                          aria-hidden
                        />
                        <span>{OUTCOME_META[key].label}</span>
                        <span className="text-center font-bold tabular-nums">
                          {counts[key]}
                        </span>
                        <span className="text-[11px] text-[#6b6159]">
                          expected about {pattern.expected[key]}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-4 text-xs font-bold">
                    This shows chances, not what will happen.
                  </p>
                </div>

                <div
                  role="img"
                  aria-label={`${revealed} of ${TOTAL_RUNS} simulated pregnancies shown`}
                  className="grid w-full max-w-[320px] grid-cols-10 gap-1.5 justify-self-end"
                >
                  {Array.from({ length: TOTAL_RUNS }, (_, i) => {
                    const filled = i < revealed;
                    return (
                      <span
                        key={i}
                        className={`aspect-square rounded-full border transition-colors duration-150 ${
                          filled
                            ? OUTCOME_META[runs[i]].dot
                            : "border-[#e6ddd5] bg-white"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        ) : (
          <section
            aria-labelledby="xlinked-title"
            className={`${cardClass} mt-5 flex min-h-80 flex-col items-center justify-center p-8 text-center`}
          >
            <h2 id="xlinked-title" className="text-base font-bold tracking-tight">
              X-linked conditions follow a different pattern
            </h2>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-[#6b6159]">
              Chances depend on which parent carries the changed copy and on the
              sex of the child, so a simple simulator could mislead you. A
              counsellor can walk through your family&rsquo;s chances with you.
            </p>
            <button
              type="button"
              onClick={bookCounsellor}
              className="mt-5 rounded-full bg-[#ff5a1f] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#ea4c12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
            >
              Talk to a counsellor
            </button>
            <p className="mt-4 text-xs text-[#6b6159]">
              This is information, not a recommendation.
            </p>
          </section>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Punnett row                                                               */
/* -------------------------------------------------------------------------- */

function PunnettRow({
  rowAllele,
  rowIndex,
  cols,
  highlight,
}: {
  rowAllele: Allele;
  rowIndex: number;
  cols: [Allele, Allele];
  highlight: SingleResult | null;
}) {
  return (
    <>
      <div role="rowheader" className="text-center text-[13px] font-bold">
        {rowAllele}
      </div>
      {cols.map((colAllele, c) => {
        const label = cellLabel(rowAllele, colAllele);
        const isScd = label === "SS";
        const isPicked = highlight?.row === rowIndex && highlight?.col === c;
        return (
          <div
            key={c}
            role="cell"
            aria-label={`${label}${isScd ? ", sickle cell disease" : ""}${
              isPicked ? ", last simulated result" : ""
            }`}
            className={`grid h-11.5 place-items-center rounded-xl text-sm font-bold transition-shadow ${
              isScd ? "bg-[#ffe1e1]" : "bg-[#f6f0ea]"
            } ${isPicked ? "ring-2 ring-[#16110d] ring-offset-2" : ""}`}
          >
            {label}
          </div>
        );
      })}
    </>
  );
}