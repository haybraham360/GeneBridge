"use client";

import { useState } from "react";
import { Check, Volume1 } from "lucide-react";

/* ---------- content ---------- */

const HEADING = "You carry one copy of the sickle cell gene change (HbAS).";

const copy = {
  standard: {
    before: "This is called ",
    bold: "sickle cell trait",
    after: ". You are healthy and you don't need treatment.",
    small:
      "It may matter when planning children, and only if your partner also carries a change in the same gene.",
  },
  simple: {
    before: "This is called ",
    bold: "sickle cell trait",
    after: ". You are healthy. You do not need treatment.",
    small:
      "It may matter if you plan to have children and your partner also has it.",
  },
};

const tiles = [
  {
    title: "Sickle cell trait (you)",
    body: "One changed copy. Healthy, no symptoms. Can pass the copy on.",
  },
  {
    title: "Sickle cell disease",
    body: "Two changed copies. A lifelong condition that needs medical care.",
  },
];

const questions = [
  {
    q: "1. Does a carrier result mean you are ill?",
    options: ["Yes", "No"],
    answer: 1,
    explain: "A carrier result does not mean you are ill. You are healthy.",
  },
  {
    q: "2. Is the chance the same for every pregnancy?",
    options: ["Yes", "No"],
    answer: 0,
    explain:
      "Each pregnancy has the same chance, no matter what happened in earlier ones.",
  },
  {
    q: "3. Who can explain what your result means for your family?",
    options: ["A genetic counsellor", "The AI assistant"],
    answer: 0,
    explain:
      "A genetic counsellor can explain what your result means for you and your family.",
  },
];

const pillBtn =
  "flex cursor-pointer items-center gap-1.75 rounded-full border border-neutral-200 bg-white px-6.5 py-3 text-[15px] font-bold text-ink shadow-card hover:bg-brand/5";

const actionBase =
  "flex h-15 items-center justify-center rounded-full text-[15px] font-bold text-ink";

/* ---------- page ---------- */

export default function ResultPage() {
  const [simple, setSimple] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(
    questions.map(() => null),
  );
  const [checked, setChecked] = useState(false);
  const [needsAll, setNeedsAll] = useState(false);

  const c = simple ? copy.simple : copy.standard;
  const score = answers.filter((a, i) => a === questions[i].answer).length;

  const listen = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(
      new SpeechSynthesisUtterance(
        `${HEADING} ${c.before}${c.bold}${c.after} ${c.small}`,
      ),
    );
  };

  const choose = (qi: number, oi: number) => {
    if (checked) return;
    setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)));
    setNeedsAll(false);
  };

  const check = () => {
    if (answers.some((a) => a === null)) {
      setNeedsAll(true);
      return;
    }
    setChecked(true);
  };

  const reset = () => {
    setAnswers(questions.map(() => null));
    setChecked(false);
    setNeedsAll(false);
  };

  return (
    <div className="px-10 pb-10 pt-9">
      <div className=" flex flex-col gap-5">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-extrabold leading-8.5 tracking-[-0.01em] text-ink">
              Your result, explained
            </h1>
            <p className="mt-2 text-[15px] leading-5 text-neutral-500">
              Sickle cell screening · Reported 28 Oct 2026 · [Screening centre]
            </p>
          </div>

          <div className="mt-2 flex shrink-0 items-center gap-3">
            <button type="button" onClick={listen} className={pillBtn}>
              <Volume1 className="h-4 w-4" strokeWidth={2.75} />
              Listen
            </button>
            <button
              type="button"
              role="checkbox"
              aria-checked={simple}
              onClick={() => setSimple((s) => !s)}
              className={pillBtn}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
                  simple
                    ? "border-ink bg-ink text-white"
                    : "border-neutral-700 bg-white"
                }`}
              >
                {simple && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              Read it simpler
            </button>
          </div>
        </header>

        {/* Hero */}
        <section className="flex flex-col gap-8 rounded-2xl bg-white p-11 shadow-card lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-160 flex-1">
            <span className="inline-block rounded-full bg-[#FFEDE2] px-3 py-1 text-[12px] font-bold leading-none text-[#9A3412]">
              Carrier
            </span>
            <h2 className="mt-4 max-w-150 text-[36px] font-extrabold leading-[1.18] tracking-[-0.02em] text-ink">
              {HEADING}
            </h2>
            <p className="mt-4 text-[17px] leading-7 text-neutral-800">
              {c.before}
              <strong className="font-semibold text-ink">{c.bold}</strong>
              {c.after}
            </p>
            <p className="mt-3 max-w-150 text-[15px] leading-5.25 text-neutral-500">
              {c.small}
            </p>
          </div>

          <div
            role="img"
            aria-label="Two gene copies: one typical copy (A) and one changed copy (S)"
            className="flex shrink-0 items-start justify-center gap-8 rounded-2xl bg-brand/5 px-8 py-6 lg:w-[36%]"
          >
            <div className="flex flex-col items-center gap-3">
              <span className="flex h-19 w-19 items-center justify-center rounded-full bg-[#ECE6E2] text-[26px] font-extrabold text-ink">
                A
              </span>
              <span className="text-[13px] font-bold text-ink">
                Typical copy
              </span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <span className="flex h-19 w-19 items-center justify-center rounded-full bg-brand text-[26px] font-extrabold text-white">
                S
              </span>
              <span className="text-[13px] font-bold text-ink">
                Changed copy
              </span>
            </div>
          </div>
        </section>

        {/* Risk cards */}
        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl bg-white p-7 shadow-card">
            <h2 className="text-[20px] font-extrabold leading-none text-ink">
              A risk is not a diagnosis
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {tiles.map((t) => (
                <div key={t.title} className="rounded-xl bg-brand/5 p-4.5">
                  <h3 className="text-[15px] font-bold leading-5 text-ink">
                    {t.title}
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-5 text-neutral-500">
                    {t.body}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl bg-white p-7 shadow-card">
            <h2 className="text-[20px] font-extrabold leading-none text-ink">
              Everyone carries something
            </h2>
            <p className="mt-3.5 text-[15px] leading-[1.7] text-neutral-500">
              Most people carry a few gene changes without ever knowing. Finding
              yours means you can plan with information instead of worry.
            </p>
            <a
              href="/dashboard/simulator"
              className="mt-4 inline-flex rounded-full border border-neutral-300 bg-white px-6 py-3 text-[15px] font-semibold text-ink hover:bg-brand/5"
            >
              What could this mean for children?
            </a>
          </article>
        </section>

        {/* Check your understanding */}
        <section className="rounded-2xl bg-white p-7 shadow-card">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[20px] font-extrabold leading-none text-ink">
              Check your understanding
            </h2>
            <span className="text-[14px] text-neutral-500">
              3 quick questions · not a test
            </span>
          </div>

          <div className="mt-5 grid items-start gap-5 md:grid-cols-3">
            {questions.map((q, qi) => {
              const ok = answers[qi] === q.answer;
              return (
                <div key={q.q} role="radiogroup" aria-labelledby={`cu-q${qi}`}>
                  <p
                    id={`cu-q${qi}`}
                    className="text-[15px] font-bold leading-5 text-ink"
                  >
                    {q.q}
                  </p>

                  <div className="mt-2.5 flex flex-col gap-2.5">
                    {q.options.map((label, oi) => {
                      const selected = answers[qi] === oi;
                      let state = "border-neutral-200 bg-white";
                      if (checked && q.answer === oi)
                        state = "border-[#86C9A0] bg-[#E7F6EC]";
                      else if (checked && selected)
                        state = "border-red-300 bg-red-50";
                      else if (selected) state = "border-brand bg-brand/5";

                      return (
                        <label
                          key={label}
                          className={`flex h-12 items-center gap-3 rounded-xl border px-4 text-[14px] font-medium text-neutral-800 focus-within:ring-2 focus-within:ring-brand/30 ${state} ${
                            checked ? "cursor-default" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`cu-q${qi}`}
                            className="sr-only"
                            checked={selected}
                            disabled={checked}
                            onChange={() => choose(qi, oi)}
                          />
                          <span
                            aria-hidden
                            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
                              selected ? "border-brand" : "border-neutral-400"
                            }`}
                          >
                            {selected && (
                              <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                            )}
                          </span>
                          {label}
                        </label>
                      );
                    })}
                  </div>

                  {checked && (
                    <p
                      className={`mt-2.5 text-[13px] leading-4.5 ${
                        ok ? "text-[#166534]" : "text-neutral-600"
                      }`}
                    >
                      <span className="font-bold">
                        {ok ? "Correct. " : "Not quite. "}
                      </span>
                      {q.explain}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={check}
              disabled={checked}
              className="rounded-full bg-ink px-6 py-3 text-[15px] font-bold text-white enabled:cursor-pointer disabled:opacity-60"
            >
              Check my answers
            </button>
            <p role="status" className="text-[14px] text-neutral-600">
              {needsAll && "Choose an answer for each question first."}
              {checked &&
                `${score} of 3 correct. ${
                  score === 3
                    ? "Well done."
                    : "A genetic counsellor can go through anything that feels unclear."
                }`}
            </p>
            {checked && (
              <button
                type="button"
                onClick={reset}
                className="cursor-pointer text-[14px] font-semibold text-[#C2410C] hover:underline"
              >
                Start again
              </button>
            )}
          </div>
        </section>

        {/* Actions */}
        <section className="grid gap-3.5 md:grid-cols-3">
          <a
            href="/dashboard/counsellor"
            className={`${actionBase} bg-brand hover:brightness-95`}
          >
            Talk to a counsellor
          </a>
          <a
            href="/dashboard/options"
            className={`${actionBase} border border-neutral-200 bg-white hover:bg-brand/5`}
          >
            Explore options
          </a>
          <a
            href="/dashboard/couple"
            className={`${actionBase} border border-neutral-200 bg-white hover:bg-brand/5`}
          >
            Share with my partner
          </a>
        </section>
      </div>
    </div>
  );
}