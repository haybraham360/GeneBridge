"use client";

import { useState } from "react";
import { Check, CircleAlert, Info, Lock, Volume1 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { speak } from "@/lib/audio/tts";

/* ---------- content ---------- */

// type Option = {
//   title: string;
//   body: string;
//   href: string;
//   linkLabel: string;
//   details?: boolean;
//   tinted?: boolean;
// };

// const options: Option[] = [
//   {
//     title: "Continue and plan ahead",
//     body: "Go ahead with pregnancy as you planned, with information about early care and newborn screening.",
//     href: "/dashboard/counsellor",
//     linkLabel: "Questions to ask your counsellor",
//     details: true,
//   },
//   {
//     title: "IVF with embryo testing (PGT)",
//     body: "Embryos are tested before transfer so only those without sickle cell disease are used.",
//     href: "/dashboard/counsellor",
//     linkLabel: "Questions to ask your counsellor",
//     details: true,
//   },
//   {
//     title: "Talk it through with a counsellor first",
//     body: "Take time to understand everything before choosing any path. There is no deadline.",
//     href: "/dashboard/counsellor",
//     linkLabel: "Questions to ask your counsellor",
//     details: true,
//   },
//   {
//     title: "Test during pregnancy",
//     body: "A test early in pregnancy shows whether the baby has sickle cell disease, so you can prepare.",
//     href: "/dashboard/counsellor",
//     linkLabel: "Questions to ask your counsellor",
//     details: true,
//   },
//   {
//     title: "Test other family members",
//     body: "Relatives may also want to know their status. You can tell them without sharing your result.",
//     href: "/dashboard/counsellor",
//     linkLabel: "Questions to ask your counsellor",
//     details: true,
//   },
//   {
//     title: "Faith and family",
//     body: "Many couples want religious guidance on these choices. See official guidance from [RELIGIOUS AUTHORITY], or discuss it with your counsellor.",
//     href: "#",
//     linkLabel: "Read official guidance",
//     tinted: true,
//   },
// ];

// const priorities = [
//   { label: "Having biological children", value: 100 },
//   { label: "Following religious guidance", value: 75 },
//   { label: "Avoiding medical procedures", value: 25 },
//   { label: "Cost of treatment", value: 50 },
//   { label: "Family's views", value: 50 },
// ];

const PRIORITIES = [
  { id: "children", value: 100 },
  { id: "religion", value: 75 },
  { id: "procedures", value: 25 },
  { id: "cost", value: 50 },
  { id: "family", value: 50 },
] as const;

const THUMB = 14;

const pillBtn =
  "flex cursor-pointer items-center gap-1.75 rounded-full border border-neutral-200 bg-white px-6.5 py-3 text-[15px] font-bold text-ink shadow-card hover:bg-brand/5";

const linkCls =
  "mt-3 inline-block text-[12px] font-bold text-[#C2410C] underline underline-offset-2 hover:text-[#9A3412]";

/* ---------- page ---------- */

/** `sharedCondition`: the couple's shared condition name, from their own data (null if none). */
export default function OptionsPage({ sharedCondition = null }: { sharedCondition?: string | null } = {}) {
  const t = useTranslations("dashboard.options");
  const tShared = useTranslations("dashboard.shared");
  const locale = useLocale();
  // const [values, setValues] = useState<number[]>(
  //   priorities.map((p) => p.value),
  // );
  const [values, setValues] = useState<number[]>(PRIORITIES.map((p) => p.value));

  const questions = t("cards.questionsLink");
  const options = [
    { id: "continue", title: t("cards.continue.title"), body: t("cards.continue.body"), href: "/dashboard/counsellor", linkLabel: questions, details: true },
    { id: "ivf", title: t("cards.ivf.title"), body: t("cards.ivf.body"), href: "/dashboard/counsellor", linkLabel: questions, details: true },
    { id: "counsellor", title: t("cards.counsellor.title"), body: t("cards.counsellor.body"), href: "/dashboard/counsellor", linkLabel: questions, details: true },
    { id: "test", title: t("cards.test.title"), body: t("cards.test.body"), href: "/dashboard/counsellor", linkLabel: questions, details: true },
    { id: "relatives", title: t("cards.relatives.title"), body: t("cards.relatives.body"), href: "/dashboard/counsellor", linkLabel: questions, details: true },
    {
      id: "faith",
      title: t("cards.faith.title"),
      body: t("cards.faith.body", { authority: t("cards.faith.authority") }),
      href: "#",
      linkLabel: t("cards.faith.link"),
      tinted: true,
    },
  ];

  const priorityLabels = {
    children: t("matters.children"),
    religion: t("matters.religion"),
    procedures: t("matters.procedures"),
    cost: t("matters.cost"),
    family: t("matters.family"),
  };

  const setValue = (i: number, v: number) =>
    setValues((prev) => prev.map((x, idx) => (idx === i ? v : x)));

  // const listen = () => {
  //   if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  //   window.speechSynthesis.cancel();
  //   const text = [
  //     "Your options. Every option here is valid. Take your time.",
  //     "GeneBridge doesn't recommend an option. Options are listed alphabetically, not ranked. A counsellor can help you think each one through.",
  //     ...options.map((o) => `${o.title}. ${o.body}`),
  //   ].join(" ");
  //   window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  // };
  const listen = () => {
    const text = [
      t("listen.intro"),
      t("notice"),
      ...options.map((o) => `${o.title}. ${o.body}`),
    ].join(" ");
    speak(text, locale === "ar" ? "ar" : "en");
  };

  return (
    <div className="min-w-0 px-[clamp(16px,3vw,40px)] pb-10 pt-7 sm:pt-9">
      <div className="mx-auto flex flex-col gap-5">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-extrabold leading-8.5 tracking-[-0.01em] text-ink">
              {/* Your options */}
              {t("header.title")} 
            </h1>
            <p className="mt-2 text-[15px] leading-5 text-neutral-500">
              {/* Every option here is valid. Take your time. */}
              {sharedCondition ? t("header.subtitleShared", { condition: sharedCondition }) : t("header.subtitle")}
            </p>
          </div>
          <button type="button" onClick={listen} className={`${pillBtn} mt-2`}>
            <Volume1 className="h-4 w-4" strokeWidth={2.75} />
            {/* Listen */}
            {tShared("listen")}
          </button>
        </header>

        {/* Notice */}
        <div
          role="note"
          className="flex items-center gap-3 rounded-2xl bg-brand/10 px-5 py-4"
        >
          <CircleAlert
            className="h-4.5 w-4.5 shrink-0 text-[#C2410C]"
            strokeWidth={1.8}
          />
          <p className="text-[14px] leading-5 text-neutral-700">
            {/* GeneBridge doesn&apos;t recommend an option. Options are listed
            alphabetically, not ranked. A counsellor can help you think each one
            through. */}
            {t("notice")} 
          </p>
        </div>

        {/* Option cards */}
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {options.map((o) => (
            <article
              // key={o.title}
              key={o.id}    
              className={`flex flex-col rounded-2xl p-6.5 ${
                o.tinted ? "bg-brand/5" : "bg-white shadow-card"
              }`}
            >
              <h2 className="text-[16px] font-bold leading-5 text-ink">
                {o.title}
              </h2>
              <p className="mt-3 text-[14px] leading-5 text-neutral-500">
                {o.body}
              </p>

              {o.details && (
                <dl className="mt-3 space-y-1.5 text-[12px] leading-4">
                  <div className="flex gap-1.5">
                    {/* <dt className="font-bold text-ink">Timeline:</dt> */}
                    {/* <dd className="text-neutral-500">[Confirm with counsellor]</dd> */}
                    <dt className="font-bold text-ink">{t("cards.timeline")}</dt>
                    <dd className="text-neutral-500">{t("cards.timelineValue")}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    {/* <dt className="font-bold text-ink">Cost and cover:</dt>
                    <dd className="text-neutral-500">[Programme details]</dd> */}
                    <dt className="font-bold text-ink">{t("cards.cost")}</dt>
                    <dd className="text-neutral-500">{t("cards.costValue")}</dd>
                  </div>
                </dl>
              )}

              <a
                href={o.href}
                className={`${linkCls} ${o.details ? "" : "mt-auto pt-3"}`}
              >
                {o.linkLabel}
              </a>
            </article>
          ))}
        </section>

        {/* Priorities + side cards */}
        <section className="grid items-start gap-5 lg:grid-cols-[1.9fr_1fr]">
          <article className="rounded-2xl bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[18px] font-extrabold leading-none text-ink">
                {/* What matters to you? */}
                {t("matters.title")}
              </h2>
              <span className="flex items-center gap-1.5 rounded-full border border-neutral-300 px-3.5 py-1.5 text-[13px] text-neutral-600">
                <Lock className="h-3.5 w-3.5 text-[#C2410C]" strokeWidth={1.8} />
                {/* Private to you */}
                {t("matters.private")}
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-6">
              {PRIORITIES.map((p, i) => {
                const v = values[i];
                const id = `matter-${i}`;
                return (
                  <div key={p.id}>
                    <label
                      htmlFor={id}
                      className="block text-[15px] font-bold leading-5 text-ink"
                    >
                      {/* {p.label} */}
                      {priorityLabels[p.id]}
                    </label>

                    <div className="relative mt-2.5 h-4">
                      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-[#3F3F3F]">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{
                            width: `calc(${v}% + ${(0.5 - v / 100) * THUMB}px)`,
                          }}
                        />
                      </div>
                      <input
                        id={id}
                        type="range"
                        min={0}
                        max={100}
                        step={25}
                        value={v}
                        onChange={(e) => setValue(i, Number(e.target.value))}
                        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent outline-none [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-brand/30"
                      />
                    </div>

                    <div className="mt-1.5 flex justify-between text-[12px] text-neutral-500">
                      {/* <span>Less important</span>
                      <span>Very important</span> */}
                      <span>{t("matters.less")}</span>
                      <span>{t("matters.more")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <div className="flex flex-col gap-5">
            <article className="rounded-2xl bg-white p-6 shadow-card">
              <h2 className="text-[18px] font-extrabold leading-none text-ink">
                {/* Compare with Khalid */}
                {t("compare.title", { name: "Khalid" })}
              </h2>
              <p className="mt-3.5 text-[13px] leading-4.5 text-neutral-500">
                {/* Khalid has finished his answers. You&apos;ll see where you agree
                and what to talk about, never a score. */}
                {t("compare.finished", { name: "Khalid", gender: "male" })} {t("compare.explain")}
              </p>

              <ul className="mt-3.5 space-y-2 text-[13px] text-neutral-800">
                <li className="flex items-center gap-2.5">
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  {/* You agreed to compare */}
                  {t("compare.agreed")}
                </li>
                <li className="flex items-center gap-2.5">
                  <Info className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {/* Waiting for Khalid to agree */}
                  {t("compare.waiting", { name: "Khalid" })}
                </li>
              </ul>

              <button
                type="button"
                disabled
                className="mt-4 h-12 w-full rounded-full bg-neutral-500 text-[14px] font-bold text-white disabled:cursor-not-allowed"
              >
                {/* Compare answers */}
                {t("compare.cta")}
              </button>
            </article>

            <article className="rounded-2xl bg-white p-6 shadow-card">
              <h2 className="text-[18px] font-extrabold leading-none text-ink">
                {/* Bring it to counselling */}
                {t("bring.title")}
              </h2>
              <p className="mt-3.5 text-[13px] leading-4.5 text-neutral-500">
                {/* Save a one-page summary of your answers and questions to share
                with Dr. Amaka before your session. */}
                {t("bring.body", { counsellor: "Dr. Amaka" })}
              </p>
              <button
                type="button"
                className="mt-4 h-12 w-full cursor-pointer rounded-full bg-brand text-[14px] font-bold text-ink hover:brightness-95"
              >
                {/* Save summary for my counsellor */}
                {t("bring.cta")}
              </button>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}