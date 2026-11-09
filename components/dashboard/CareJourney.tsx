import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

type Status = "done" | "current" | "upcoming" | "optional";

function Marker({ status }: { status: Status }) {
  const base = "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full";
  if (status === "done")
    return (
      <span className={`${base} bg-ink text-white`}>
        <Check aria-hidden="true" className="size-4.5" strokeWidth={2.4} />
      </span>
    );
  if (status === "current")
    return (
      <span className={`${base} bg-brand ring-4 ring-brand-ring`} aria-current="step">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-surface" />
      </span>
    );
  if (status === "optional") return <span className={`${base} border-2 border-dashed border-neutral-line bg-surface`} />;
  return <span className={`${base} border-2 border-neutral-line bg-surface`} />;
}

type Step = { key: string; title: string; meta: string; status: Status };

/**
 * The 6-step care journey. Steps come from the patient's own data (lib/care).
 * A thin track joins the markers (down the side on phones, across from
 * 768px); the part already walked is ink.
 */
export default function CareJourney({ steps, current, style }: { steps: Step[]; current: number; style?: CSSProperties }) {
  const t = useTranslations("dashboard.careJourney");
  const done = steps.filter((s) => s.status === "done").length;
  const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;

  return (
    <section aria-labelledby="care-journey-title" className="rise-in rounded-card border border-line bg-surface p-5 shadow-card sm:p-6" style={style}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="care-journey-title" className="text-[20px] font-extrabold leading-none tracking-[-0.01em]">
          {t("title")}
        </h2>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-neutral-fill sm:block">
            <span className="block h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${percent}%` }} />
          </span>
          <span className="rounded-full bg-brand-tint-soft px-3 py-1 text-[13px] font-bold text-brand-text-dark">
            {t("progress", { current, total: steps.length })}
          </span>
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-6 md:gap-3" data-testid="care-journey">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const walked = s.status === "done";
          return (
            <li
              key={s.key}
              data-step={s.key}
              data-status={s.status}
              className={cn(
                "relative flex items-start gap-3 md:block",
                // The track to the next step.
                !last &&
                  "after:absolute after:start-4.25 after:top-10 after:-bottom-2.5 after:w-0.5 after:rounded-full md:after:start-11 md:after:-end-2 md:after:top-4.25 md:after:bottom-auto md:after:h-0.5 md:after:w-auto",
                !last && (walked ? "after:bg-ink" : "after:bg-neutral-fill"),
              )}
            >
              <Marker status={s.status} />
              <div className="min-w-0 pt-1 md:pt-0">
                <div
                  className={cn(
                    "text-[14px] font-bold leading-tight md:mt-3",
                    s.status === "upcoming" || s.status === "optional" ? "text-ink/70" : "text-ink",
                  )}
                >
                  {s.title}
                </div>
                <div className="mt-1 text-[13px] leading-snug text-muted">{s.meta}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
