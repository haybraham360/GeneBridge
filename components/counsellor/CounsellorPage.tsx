"use client";

import { useState } from "react";
import { Check, Info } from "lucide-react";

/* ---------- content ---------- */

const counsellors = [
  {
    id: "amaka",
    initials: "AO",
    name: "Dr. Amaka Okoro",
    next: "Thu 12 Nov",
    langs: ["English", "Arabic"],
    avatar: "bg-ink text-white",
  },
  {
    id: "layla",
    initials: "LH",
    name: "Dr. Layla Haddad",
    next: "Wed 11 Nov",
    langs: ["Arabic", "English", "French"],
    avatar: "bg-[#FFE2D2] text-[#9A3412]",
  },
  {
    id: "omar",
    initials: "OS",
    name: "Mr. Omar Siddiqui",
    next: "Sun 15 Nov",
    langs: ["Urdu", "Hindi", "English"],
    avatar: "bg-[#E5ECF6] text-[#1E3A8A]",
  },
];

const days = ["Wed 11", "Thu 12", "Sun 15"];
const times = ["09:00", "10:00", "11:30", "14:00"];
const sessions = ["Video call", "In person"];
const shareItems = ["Summary of my result", "My values summary", "My family map"];

type Step = {
  title: string;
  meta: string;
  status: "done" | "current" | "upcoming" | "optional";
};

const path: Step[] = [
  { title: "Screening result received", meta: "28 Oct · [Screening centre]", status: "done" },
  { title: "Counselling booked", meta: "3 Nov · Dr. Amaka Okoro", status: "done" },
  { title: "Counselling session", meta: "Thu 12 Nov, 10:00 · Video call", status: "current" },
  { title: "Confirmatory test", meta: "Arranged after your session, if advised", status: "upcoming" },
  { title: "Specialist referral", meta: "Only if needed", status: "optional" },
];

const selectBtn = (on: boolean) =>
  `h-12 cursor-pointer rounded-xl border text-[14px] font-bold transition-colors ${
    on
      ? "border-ink bg-ink text-white"
      : "border-neutral-200 bg-white text-ink hover:bg-brand/5"
  }`;

/* ---------- page ---------- */

export default function CounsellorPage() {
  const [counsellor, setCounsellor] = useState("amaka");
  const [day, setDay] = useState("Thu 12");
  const [time, setTime] = useState("10:00");
  const [session, setSession] = useState("Video call");
  const [share, setShare] = useState<string[]>([
    "Summary of my result",
    "My values summary",
  ]);
  const [confirmed, setConfirmed] = useState(false);

  const current = counsellors.find((c) => c.id === counsellor)!;
  const firstName = current.name.split(" ").slice(0, 2).join(" ");

  const toggleShare = (item: string) =>
    setShare((s) => (s.includes(item) ? s.filter((x) => x !== item) : [...s, item]));

  const edit = <T,>(setter: (v: T) => void, v: T) => {
    setter(v);
    setConfirmed(false);
  };

  return (
    <div className="min-w-0 px-10 pb-10 pt-9">
      <div className="mx-auto flex flex-col gap-5">
        {/* Header */}
        <header>
          <h1 className="text-[32px] font-extrabold leading-8.5 tracking-[-0.01em] text-ink">
            Counsellor &amp; referral
          </h1>
          <p className="mt-2 text-[15px] leading-5 text-neutral-500">
            Qualified genetic counsellors, in your language.
          </p>
        </header>

        {/* Notice */}
        <div
          role="note"
          className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white px-5 py-4 shadow-card"
        >
          <Info className="h-4 w-4 shrink-0 text-[#C2410C]" strokeWidth={1.8} />
          <p className="text-[14px] leading-5 text-neutral-700">
            Some results, such as uncertain or complex findings, need a
            specialist to explain them. When that happens, GeneBridge brings you
            straight here instead of showing an explanation.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Left column */}
          <div className="flex flex-col gap-5">
            <h2 className="text-[20px] font-extrabold leading-none text-ink">
              Choose a counsellor
            </h2>

            <div role="radiogroup" aria-label="Choose a counsellor" className="flex flex-col gap-4">
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
                        Certified genetic counsellor · Next: {c.next}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {c.langs.map((l) => (
                          <li
                            key={l}
                            className="rounded-full bg-[#FFEDE2] px-2.5 py-0.5 text-[11px] font-medium text-[#9A3412]"
                          >
                            {l}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${selected ? "Selected" : "Select"} ${c.name}`}
                      onClick={() => edit(setCounsellor, c.id)}
                      className={`h-10 shrink-0 cursor-pointer rounded-full px-6 text-[13px] font-bold ${
                        selected
                          ? "bg-ink text-white"
                          : "border border-neutral-300 bg-white text-ink hover:bg-brand/5"
                      }`}
                    >
                      {selected ? "Selected" : "Select"}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Referral path */}
            <section className="rounded-2xl bg-white p-6 shadow-card">
              <h2 className="text-[18px] font-extrabold leading-none text-ink">
                Your referral path
              </h2>

              <ol className="mt-5">
                {path.map((s, i) => {
                  const last = i === path.length - 1;
                  return (
                    <li key={s.title} className="relative flex gap-3.5 pb-4 last:pb-0">
                      {!last && (
                        <span
                          aria-hidden
                          className="absolute left-3 top-6 bottom-0 w-px -translate-x-1/2 bg-neutral-300"
                        />
                      )}
                      <Marker status={s.status} />
                      <div>
                        <p className="text-[14px] font-bold leading-4.5 text-ink">
                          {s.title}
                        </p>
                        <p className="text-[12px] leading-4 text-neutral-500">
                          {s.meta}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E5ECF6] px-3.5 py-1.5 text-[12px] text-[#1E3A8A]">
                <Check className="h-3 w-3" strokeWidth={2.5} />
                Referral shared with your health record (Malaffi, demo)
              </p>
            </section>
          </div>

          {/* Booking panel */}
          <aside className="rounded-2xl bg-white p-6 shadow-card lg:sticky lg:top-0">
            <h2 className="text-[18px] font-extrabold leading-none text-ink">
              Book with {firstName}
            </h2>

            <Group label="Day">
              <div className="grid grid-cols-3 gap-2.5">
                {days.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={day === d}
                    onClick={() => edit(setDay, d)}
                    className={selectBtn(day === d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Group>

            <Group label="Time">
              <div className="grid grid-cols-2 gap-2.5">
                {times.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={time === t}
                    onClick={() => edit(setTime, t)}
                    className={selectBtn(time === t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Group>

            <Group label="Session">
              <div className="grid grid-cols-2 gap-2.5">
                {sessions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={session === s}
                    onClick={() => edit(setSession, s)}
                    className={selectBtn(session === s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Group>

            <fieldset className="mt-5 rounded-xl bg-brand/5 p-4">
              <legend className="sr-only">Share before the session</legend>
              <p className="text-[13px] font-bold text-ink">
                Share before the session
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {shareItems.map((item) => {
                  const on = share.includes(item);
                  return (
                    <label
                      key={item}
                      className="flex cursor-pointer items-center gap-3 text-[13px] text-neutral-800"
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
                      {item}
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
              Confirm booking
            </button>

            <p
              role="status"
              className={`mt-3.5 text-center text-[12px] leading-4 ${
                confirmed ? "font-semibold text-[#166534]" : "text-neutral-500"
              }`}
            >
              {confirmed
                ? `Booked with ${current.name} · ${day} Nov, ${time} · ${session}`
                : "You can invite Khalid to join the session."}
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