import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

type Status = "done" | "current" | "upcoming" | "optional";


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

type Step = { key: string; title: string; meta: string; status: Status };

/** The 6-step care journey. Steps come from the patient's own data (lib/care). */
export default function CareJourney({ steps, current }: { steps: Step[]; current: number }) {

  const t = useTranslations("dashboard.careJourney");

  return (
    <section className="rounded-2xl bg-white px-7 py-7 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[20px] font-extrabold leading-none">
          {t("title")}
        </h2>
        <span className="text-[14px] text-neutral-500">{t("progress", { current, total: steps.length })}</span>
      </div>

      <ol className="mt-5 grid grid-cols-[repeat(6,1fr)]" data-testid="care-journey">
        {steps.map((s) => (
          <li key={s.key} data-step={s.key} data-status={s.status}>
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
