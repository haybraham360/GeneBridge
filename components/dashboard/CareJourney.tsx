import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

type Status = "done" | "current" | "upcoming" | "optional";


function Marker({ status }: { status: Status }) {
  const base = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full";
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
    <section className="rounded-2xl bg-white p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[20px] font-extrabold leading-none">
          {t("title")}
        </h2>
        <span className="text-[14px] text-neutral-500">{t("progress", { current, total: steps.length })}</span>
      </div>

      <ol className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-y-6 lg:grid-cols-6 lg:gap-x-3" data-testid="care-journey">
        {steps.map((s) => (
          <li key={s.key} data-step={s.key} data-status={s.status} className="flex items-center gap-3 sm:block">
            <Marker status={s.status} />
            <div className="min-w-0">
              <div className="text-[14px] font-bold leading-tight sm:mt-3">
                {s.title}
              </div>
              <div className="mt-1 text-[13px] leading-snug text-neutral-500 sm:mt-2">
                {s.meta}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
