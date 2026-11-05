"use client";

import { useMemo, useState } from "react";
import { Check, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/* ---------- content ---------- */

type DayId = "wed11" | "thu12" | "sun15";
type SessionId = "video" | "inPerson";
type ShareId = "fullReport" | "result" | "values" | "family";
type StepId = "received" | "booked" | "session" | "test" | "specialist";

// const counsellors = [
//   {
//     id: "amaka",
//     initials: "AO",
//     name: "Dr. Amaka Okoro",
//     next: "Thu 12 Nov",
//     langs: ["English", "Arabic"],
//     avatar: "bg-ink text-white",
//   },
//   {
//     id: "layla",
//     initials: "LH",
//     name: "Dr. Layla Haddad",
//     next: "Wed 11 Nov",
//     langs: ["Arabic", "English", "French"],
//     avatar: "bg-[#FFE2D2] text-[#9A3412]",
//   },
//   {
//     id: "omar",
//     initials: "OS",
//     name: "Mr. Omar Siddiqui",
//     next: "Sun 15 Nov",
//     langs: ["Urdu", "Hindi", "English"],
//     avatar: "bg-[#E5ECF6] text-[#1E3A8A]",
//   },
// ];

// const days = ["Wed 11", "Thu 12", "Sun 15"];
// const times = ["09:00", "10:00", "11:30", "14:00"];
// const sessions = ["Video call", "In person"];
// const shareItems = ["Summary of my result", "My values summary", "My family map"];

const counsellors = [
  { id: "amaka", initials: "AO", name: "Dr. Amaka Okoro", nextDay: "thu12" as DayId,
    langs: ["en", "ar"], avatar: "bg-ink text-white" },
  { id: "layla", initials: "LH", name: "Dr. Layla Haddad", nextDay: "wed11" as DayId,
    langs: ["ar", "en", "fr"], avatar: "bg-[#FFE2D2] text-[#9A3412]" },
  { id: "omar", initials: "OS", name: "Mr. Omar Siddiqui", nextDay: "sun15" as DayId,
    langs: ["ur", "hi", "en"], avatar: "bg-[#E5ECF6] text-[#1E3A8A]" },
];

const DAYS: DayId[] = ["wed11", "thu12", "sun15"];
const TIMES = ["09:00", "10:00", "11:30", "14:00"];
const SESSIONS: SessionId[] = ["video", "inPerson"];
const SHARE_ITEMS: ShareId[] = ["result", "values", "family"];

// type Step = {
//   title: string;
//   meta: string;
//   status: "done" | "current" | "upcoming" | "optional";
// };

// const path: Step[] = [
//   { title: "Screening result received", meta: "28 Oct · [Screening centre]", status: "done" },
//   { title: "Counselling booked", meta: "3 Nov · Dr. Amaka Okoro", status: "done" },
//   { title: "Counselling session", meta: "Thu 12 Nov, 10:00 · Video call", status: "current" },
//   { title: "Confirmatory test", meta: "Arranged after your session, if advised", status: "upcoming" },
//   { title: "Specialist referral", meta: "Only if needed", status: "optional" },
// ];

type StepStatus = "done" | "current" | "upcoming" | "optional";
type Step = { id: StepId; status: StepStatus };
/** A referral-path step from the patient's own data (lib/care), already translated. */
type LiveStep = { title: string; meta: string; status: StepStatus };
const PATH: Step[] = [
  { id: "received", status: "done" },
  { id: "booked", status: "done" },
  { id: "session", status: "current" },
  { id: "test", status: "upcoming" },
  { id: "specialist", status: "optional" },
];

const selectBtn = (on: boolean) =>
  `h-12 cursor-pointer rounded-xl border text-[14px] font-bold transition-colors ${
    on
      ? "border-ink bg-ink text-white"
      : "border-neutral-200 bg-white text-ink hover:bg-brand/5"
  }`;

/* ---------- page ---------- */

type Props = {
  /** The referral path from the patient's own data (lib/care). Falls back to the demo path. */
  path?: LiveStep[];
  /** Flagged result: "My full report" is suggested and pre-ticked (task 07). */
  flagged?: boolean;
};

export default function CounsellorPage({ path: livePath, flagged = false }: Props = {}) {
  const t = useTranslations("dashboard.counsellor");
  const tBooking = useTranslations("dashboard.booking");
  const locale = useLocale();
  const shareOptions: ShareId[] = flagged ? ["fullReport", ...SHARE_ITEMS] : SHARE_ITEMS;
  
  // const [counsellor, setCounsellor] = useState("amaka");
  // const [day, setDay] = useState("Thu 12");
  // const [time, setTime] = useState("10:00");
  // const [session, setSession] = useState("Video call");
  // const [share, setShare] = useState<string[]>([
  //   "Summary of my result",
  //   "My values summary",
  // ]);
  // const [confirmed, setConfirmed] = useState(false);
  const [counsellor, setCounsellor] = useState("amaka");
  const [day, setDay] = useState<DayId>("thu12");
  const [time, setTime] = useState("10:00");
  const [session, setSession] = useState<SessionId>("video");
  // Pre-ticked for flagged results, but nothing is shared until the patient
  // confirms the booking, and they can untick it.
  const [share, setShare] = useState<ShareId[]>([
    ...(flagged ? (["fullReport"] as ShareId[]) : []),
    "result",
    "values",
  ]);
  const [confirmed, setConfirmed] = useState(false);

  const current = counsellors.find((c) => c.id === counsellor)!;
  const firstName = current.name.split(" ").slice(0, 2).join(" ");

  // const toggleShare = (item: string) =>
  //   setShare((s) => (s.includes(item) ? s.filter((x) => x !== item) : [...s, item]));
  const toggleShare = (item: ShareId) =>
    setShare((s) => (s.includes(item) ? s.filter((x) => x !== item) : [...s, item]));

  const edit = <T,>(setter: (v: T) => void, v: T) => {
    setter(v);
    setConfirmed(false);
  };

  const dayShort: Record<DayId, string> = {
    wed11: t("days.short.wed11"), thu12: t("days.short.thu12"), sun15: t("days.short.sun15"),
  };
  const dayLong: Record<DayId, string> = {
    wed11: t("days.long.wed11"), thu12: t("days.long.thu12"), sun15: t("days.long.sun15"),
  };
  const sessionLabel: Record<SessionId, string> = {
    video: t("book.video"), inPerson: t("book.inPerson"),
  };
  const shareLabel: Record<ShareId, string> = {
    fullReport: tBooking("fullReport"),
    result: t("book.share.result"), values: t("book.share.values"), family: t("book.share.family"),
  };
  const stepText: Record<StepId, { title: string; meta: string }> = {
    received: { title: t("referral.steps.received.title"), meta: t("referral.steps.received.meta", { centre: "[Screening centre]" }) },
    booked: { title: t("referral.steps.booked.title"), meta: t("referral.steps.booked.meta", { counsellor: "Dr. Amaka Okoro" }) },
    session: { title: t("referral.steps.session.title"), meta: t("referral.steps.session.meta") },
    test: { title: t("referral.steps.test.title"), meta: t("referral.steps.test.meta") },
    specialist: { title: t("referral.steps.specialist.title"), meta: t("referral.steps.specialist.meta") },
  };

  const steps: LiveStep[] =
    livePath ?? PATH.map((s) => ({ ...stepText[s.id], status: s.status }));

  // language names in the user's language, no message keys needed
  const langName = useMemo(() => {
    const dn = new Intl.DisplayNames(locale, { type: "language" });
    return (code: string) => dn.of(code) ?? code;
  }, [locale]);

  return (
    <div className="min-w-0 px-10 pb-10 pt-9">
      <div className="mx-auto flex flex-col gap-5">
        {/* Header */}
        <header>
          <h1 className="text-[32px] font-extrabold leading-8.5 tracking-[-0.01em] text-ink">
            {/* Counsellor &amp; referral */}
            {t("header.title")}
          </h1>
          <p className="mt-2 text-[15px] leading-5 text-neutral-500">
            {/* Qualified genetic counsellors, in your language. */}
            {t("header.subtitle")} 
          </p>
        </header>

        {/* Notice */}
        <div
          role="note"
          className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white px-5 py-4 shadow-card"
        >
          <Info className="h-4 w-4 shrink-0 text-[#C2410C]" strokeWidth={1.8} />
          <p className="text-[14px] leading-5 text-neutral-700">
            {/* Some results, such as uncertain or complex findings, need a
            specialist to explain them. When that happens, GeneBridge brings you
            straight here instead of showing an explanation. */}
            {t("notice")}
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Left column */}
          <div className="flex flex-col gap-5">
            <h2 className="text-[20px] font-extrabold leading-none text-ink">
              {/* Choose a counsellor */}
              {t("choose.title")}
            </h2>

            <div role="radiogroup" aria-label={t("choose.title")} className="flex flex-col gap-4">
              {counsellors.map((c) => {
                const selected = c.id === counsellor;
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card ${
                      selected ? "border border-brand ring-1 ring-brand" : "border border-transparent"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[18px] font-bold ${c.avatar}`}
                    >
                      {c.initials}
                    </span>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-[16px] font-extrabold leading-5 text-ink">
                        {c.name}
                      </h3>
                      <p className="mt-0.5 text-[13px] leading-4.5 text-neutral-500">
                        {/* Certified genetic counsellor · Next: {c.next} */}
                        {t("choose.caption", { next: dayLong[c.nextDay] })}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {c.langs.map((l) => (
                          <li
                            key={l}
                            className="rounded-full bg-[#FFEDE2] px-2.5 py-0.5 text-[11px] font-medium text-[#9A3412]"
                          >
                            {langName(l)}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      // aria-label={`${selected ? "Selected" : "Select"} ${c.name}`}
                      aria-label={selected ? t("choose.selectedAria", { name: c.name }) : t("choose.selectAria", { name: c.name })}
                      onClick={() => edit(setCounsellor, c.id)}
                      className={`h-10 shrink-0 cursor-pointer rounded-full px-6 text-[13px] font-bold ${
                        selected
                          ? "bg-ink text-white"
                          : "border border-neutral-300 bg-white text-ink hover:bg-brand/5"
                      }`}
                    >
                      {/* {selected ? "Selected" : "Select"} */}
                      {selected ? t("choose.selected") : t("choose.select")}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Referral path */}
            <section className="rounded-2xl bg-white p-6 shadow-card">
              <h2 className="text-[18px] font-extrabold leading-none text-ink">
                {/* Your referral path */}
                {t("referral.title")}
              </h2>

              <ol className="mt-5">
                {steps.map((s, i) => {
                  const last = i === steps.length - 1;
                  return (
                    <li key={s.title} className="relative flex gap-3.5 pb-4 last:pb-0" data-status={s.status}>
                      {!last && (
                        <span
                          aria-hidden
                          className="absolute left-3 top-6 bottom-0 w-px ltr:-translate-x-1/2 rtl:translate-x-1/2 bg-neutral-300"
                        />
                      )}
                      <Marker status={s.status} />
                      <div>
                        <p className="text-[14px] font-bold leading-4.5 text-ink">
                          {/* {s.title} */}
                          {s.title}
                        </p>
                        <p className="text-[12px] leading-4 text-neutral-500">
                          {/* {s.meta} */}
                          {s.meta}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E5ECF6] px-3.5 py-1.5 text-[12px] text-[#1E3A8A]">
                <Check className="h-3 w-3" strokeWidth={2.5} />
                {/* Referral shared with your health record (Malaffi, demo) */}
                {t("referral.record")}
              </p>
            </section>
          </div>

          {/* Booking panel */}
          <aside className="rounded-2xl bg-white p-6 shadow-card lg:sticky lg:top-0">
            <h2 className="text-[18px] font-extrabold leading-none text-ink">
              {/* Book with {firstName} */}
              {t("book.title", { name: firstName })}
            </h2>

            {/* <Group label="Day"> */}
            <Group label={t("book.day")}>
              <div className="grid grid-cols-3 gap-2.5">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={day === d}
                    onClick={() => edit(setDay, d)}
                    className={selectBtn(day === d)}
                  >
                    {/* {d} */}
                    {dayShort[d]}
                  </button>
                ))}
              </div>
            </Group>

            {/* <Group label="Time"> */}
            <Group label={t("book.time")}> 
              <div className="grid grid-cols-2 gap-2.5">
                {TIMES.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={time === slot}
                    onClick={() => edit(setTime, slot)}
                    className={selectBtn(time === slot)}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </Group>

            {/* <Group label="Session"> */}
            <Group label={t("book.session")}>
              <div className="grid grid-cols-2 gap-2.5">
                {SESSIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={session === s}
                    onClick={() => edit(setSession, s)}
                    className={selectBtn(session === s)}
                  >
                    {/* {s} */}
                    {sessionLabel[s]}
                  </button>
                ))}
              </div>
            </Group>

            <fieldset className="mt-5 rounded-xl bg-brand/5 p-4">
              {/* <legend className="sr-only">Share before the session</legend> */}
              {/* <p className="text-[13px] font-bold text-ink">
                Share before the session
              </p> */}
              <legend>{t("book.shareLegend")}</legend> 
              <p className="text-[13px] font-bold text-ink">
                {t("book.shareLegend")}
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {shareOptions.map((item) => {
                  const on = share.includes(item);
                  return (
                    <label
                      key={item}
                      className="flex cursor-pointer flex-wrap items-center gap-3 text-[13px] text-neutral-800"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          toggleShare(item);
                          setConfirmed(false);
                        }}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={`flex h-4 w-4 items-center justify-center rounded-sm border peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 ${
                          on
                            ? "border-ink bg-ink text-white"
                            : "border-neutral-600 bg-white"
                        }`}
                      >
                        {on && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      {/* {item} */}
                      {shareLabel[item]}
                      {item === "fullReport" ? (
                        <span className="basis-full ps-7 text-[12px] text-neutral-600">
                          {tBooking("fullReportHint")}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="mt-5 h-13 w-full cursor-pointer rounded-full bg-brand text-[15px] font-bold text-ink hover:brightness-95"
            >
              {/* Confirm booking */}
              {t("book.confirm")}
            </button>

            <p
              role="status"
              className={`mt-3.5 text-center text-[12px] leading-4 ${
                confirmed ? "font-semibold text-[#166534]" : "text-neutral-500"
              }`}
            >
              {/* {confirmed
                ? `Booked with ${current.name} · ${day} Nov, ${time} · ${session}`
                : "You can invite Khalid to join the session."} */}
              {confirmed
                ? t("book.booked", { counsellor: current.name, day: dayLong[day], time, session: sessionLabel[session] })
                : t("book.invite", { partner: "Khalid" })}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-[13px] font-bold text-ink">{label}</p>
      {children}
    </div>
  );
}

function Marker({ status }: { status: Step["status"] }) {
  const base = "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full";
  if (status === "done")
    return (
      <span className={`${base} bg-ink text-white`}>
        <Check className="h-3 w-3" strokeWidth={2.5} />
      </span>
    );
  if (status === "current")
    return (
      <span className={`${base} bg-white`} aria-current="step">
        <span className="h-5 w-5 rounded-full bg-brand ring-[3px] ring-brand/15" />
      </span>
    );
  if (status === "optional")
    return <span className={`${base} border border-dashed border-neutral-400 bg-white`} />;
  return <span className={`${base} border border-neutral-400 bg-white`} />;
}