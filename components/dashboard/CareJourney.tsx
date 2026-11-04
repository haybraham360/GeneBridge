import { Check } from "lucide-react";

type Status = "done" | "current" | "upcoming" | "optional";

const steps: { title: string; meta: string; status: Status }[] = [
  { title: "Screening done", meta: "28 Oct", status: "done" },
  { title: "Result understood", meta: "29 Oct", status: "done" },
  { title: "Counselling booked", meta: "Thu 12 Nov, 10:00", status: "current" },
  { title: "Counselling session", meta: "Upcoming", status: "upcoming" },
  { title: "Confirmatory test", meta: "If advised", status: "upcoming" },
  { title: "Specialist", meta: "Only if needed", status: "optional" },
];

function Marker({ status }: { status: Status }) {
  const base = "flex h-9 w-9 items-center justify-center rounded-full";
  if (status === "done")
    return (
      <span className={`${base} bg-ink text-white`}>
        <Check className="h-4.5 w-4.5" strokeWidth={2.2} />
      </span>
    );
  if (status === "current")
    return (
      <span
        className={`${base} bg-brand ring-[3px] ring-brand/10`}
        aria-current="step"
      />
    );
  if (status === "optional")
    return (
      <span className={`${base} border border-dashed border-neutral-400`} />
    );
  return <span className={`${base} border border-neutral-300 bg-white`} />;
}

export default function CareJourney() {
  return (
    <section className="rounded-2xl bg-white px-7 py-7 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[20px] font-extrabold leading-none">
          Your care journey
        </h2>
        <span className="text-[14px] text-neutral-500">Step 3 of 6</span>
      </div>

      <ol className="mt-5 grid grid-cols-[repeat(6,1fr)]">
        {steps.map((s) => (
          <li key={s.title}>
            <Marker status={s.status} />
            <div className="mt-3 text-[14px] font-bold leading-3.5">
              {s.title}
            </div>
            <div className="mt-3 text-[13px] leading-3.25 text-neutral-500">
              {s.meta}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
