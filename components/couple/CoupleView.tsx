"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import {
  Calendar,
  Check,
  CircleAlert,
  Compass,
  Layers,
  Minus,
  Shield,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";  

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type FigureVariant = "affected" | "carrier" | "unchanged";

interface Partner {
  id: string;
  name: string;
  sharing: boolean;
}

// interface Outcome {
//   id: string;
//   variant: FigureVariant;
//   figureLabel: string;
//   percent: number;
//   percentLabel: string;
//   percentClass: string;
// }
interface Outcome {
  id: "scd" | "carrier" | "none";
  variant: FigureVariant;
  percent: number;
  percentClass: string;
}

type ActionKey = "simulator" | "options" | "session";

interface ActionCardData {
  key: ActionKey;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  href: string;
}

export interface CoupleViewProps {
  partners?: [Partner, Partner];
  /** Display string for the date both partners agreed to share. */
  agreedOn?: string;
  onAction?: (key: ActionKey) => void;
  onSharingChange?: (partners: Partner[]) => void;
}

/* -------------------------------------------------------------------------- */
/*  Static content                                                            */
/* -------------------------------------------------------------------------- */

const DEFAULT_PARTNERS: [Partner, Partner] = [
  { id: "mariam", name: "Mariam", sharing: true },
  { id: "khalid", name: "Khalid", sharing: true },
];

const OUTCOMES: Outcome[] = [
  {
    id: "scd",
    variant: "affected",
    percent: 25,
    percentClass: "text-[#9f1239]",
    // figureLabel: "Sickle cell disease",
    // percentLabel: "Child has sickle cell disease",
  },
  {
    id: "carrier",
    variant: "carrier",
    percent: 50,
    percentClass: "text-[#b9420f]",
    // figureLabel: "Carrier, healthy",
    // percentLabel: "Child is a healthy carrier",
  },
  {
    id: "none",
    variant: "unchanged",
    percent: 25,
    percentClass: "text-[#15803d]",
    // figureLabel: "No changed copy",
    // percentLabel: "Child has no changed copy",
  },
];

/** Four figures: 1 affected, 2 carriers, 1 unchanged (Punnett square for AS x AS). */
// const FIGURES: { id: string; variant: FigureVariant; label: string }[] = [
//   { id: "f1", variant: "affected", label: "Sickle cell disease" },
//   { id: "f2", variant: "carrier", label: "Carrier, healthy" },
//   { id: "f3", variant: "carrier", label: "Carrier, healthy" },
//   { id: "f4", variant: "unchanged", label: "No changed copy" },
// ];
const FIGURES: { id: string; variant: FigureVariant }[] = [
  { id: "f1", variant: "affected" },
  { id: "f2", variant: "carrier" },
  { id: "f3", variant: "carrier" },
  { id: "f4", variant: "unchanged" },
];

const ACTIONS: ActionCardData[] = [
  {
    key: "simulator",
    title: "See how it works",
    description: "Simulate pregnancies in the inheritance simulator.",
    icon: Layers,
    href: '/dashboard/simulator'
  },
  {
    key: "options",
    title: "Explore your options",
    description: "Every path, shown equally.",
    icon: Compass,
    href: '/dashboard/options'
  },
  {
    key: "session",
    title: "Talk it through together",
    description: "Book a couple session with a counsellor.",
    icon: Calendar,
    href: '/dashboard/counsellor'
  },
];

/* -------------------------------------------------------------------------- */
/*  Figure (person icon)                                                      */
/* -------------------------------------------------------------------------- */

const FIGURE_STYLES: Record<
  FigureVariant,
  { fill: string; stroke: string }
> = {
  affected: { fill: "#9f1239", stroke: "#9f1239" },
  carrier: { fill: "#ff5a1f", stroke: "#c2410c" },
  unchanged: { fill: "#ffffff", stroke: "#5b524c" },
};

function Figure({ variant }: { variant: FigureVariant }) {
  const { fill, stroke } = FIGURE_STYLES[variant];
  return (
    <svg
      viewBox="0 0 44 56"
      className="h-14 w-11"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="22" cy="11" r="9" fill={fill} stroke={stroke} strokeWidth="2.5" />
      <path
        d="M3.5 54.5 V47 C3.5 35.5 11.5 27.5 22 27.5 C32.5 27.5 40.5 35.5 40.5 47 V54.5 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Consent chip                                                              */
/* -------------------------------------------------------------------------- */

function ConsentChip({ partner }: { partner: Partner }) {
  const t = useTranslations("dashboard.couple.chip");

  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold ${
        partner.sharing
          ? "border-[#f3e4d9] text-[#16110d]"
          : "border-[#ecdccf] text-[#6b6159]"
      }`}
    >
      {partner.sharing ? (
        <Check className="size-3.5 text-[#15803d]" strokeWidth={2.5} aria-hidden />
      ) : (
        <Minus className="size-3.5 text-[#8a7f76]" strokeWidth={2.5} aria-hidden />
      )}
      {/* {partner.sharing
        ? `${partner.name} agreed · summary only`
        : `${partner.name} paused sharing`} */}
        {partner.sharing
          ? t("agreed", { name: partner.name })
          : t("paused", { name: partner.name })}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Action card                                                               */
/* -------------------------------------------------------------------------- */


function ActionCard({
  data,
  onSelect,
}: {
  data: ActionCardData;
  onSelect: (key: ActionKey) => void;
}) {
  const Icon = data.icon;
  const router = useRouter();
  const href = data.href;
  const t = useTranslations("dashboard.couple.actions");
  const copy = {
    simulator: { title: t("simulator.title"), description: t("simulator.description") },
    options: { title: t("options.title"), description: t("options.description") },
    session: { title: t("session.title"), description: t("session.description") },
  }[data.key];

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(data.key)
        if (href) setTimeout(() => router.push(href), 1500);
      }}
      className="group block w-full rounded-2xl border border-[#f6e9df] bg-white p-4 text-left shadow-[0_1px_2px_rgba(120,60,20,0.04),0_4px_14px_rgba(120,60,20,0.04)] transition hover:border-[#f0c9b0] hover:shadow-[0_6px_20px_rgba(194,65,12,0.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
    >
      <Icon className="size-4.5 text-[#e8531c]" aria-hidden />
      <h3 className="mt-3 text-sm font-bold text-[#16110d]">{copy.title}</h3>
      <p className="mt-1.5 text-xs leading-snug text-[#6b6159]">
        {/* {data.description} */}
        {copy.description}
      </p>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Manage sharing dialog                                                     */
/* -------------------------------------------------------------------------- */

function Switch({
  checked,
  onChange,
  labelledBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c] ${
        checked ? "bg-[#15803d]" : "bg-[#d9cdc3]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function ManageSharingDialog({
  partners,
  onToggle,
  onClose,
}: {
  partners: Partner[];
  onToggle: (id: string, next: boolean) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations("dashboard.couple.dialog");

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#16110d]/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_20px_60px_rgba(60,25,5,0.25)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-[#16110d]">
              {/* Manage sharing */}
              {t("title")}
            </h2>
            <p id={descId} className="mt-1 text-sm text-[#6b6159]">
              {/* Each of you controls your own result summary. Only summaries are
              shared, never full results. */}
              {t("description")}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            // aria-label="Close"
            aria-label={t("close")}
            className="rounded-full p-1.5 text-[#6b6159] transition hover:bg-[#fff4ec] focus-visible:outline-2 focus-visible:outline-[#c2410c]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <ul className="mt-5 divide-y divide-[#f6e9df] rounded-2xl border border-[#f6e9df]">
          {partners.map((p) => {
            const labelId = `${titleId}-${p.id}`;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <p id={labelId} className="text-sm font-semibold text-[#16110d]">
                    {p.name}
                  </p>
                  <p className="text-xs text-[#6b6159]">
                    {/* {p.sharing ? "Sharing result summary" : "Sharing paused"} */}
                     {p.sharing ? t("sharing") : t("pausedState")}
                  </p>
                </div>
                <Switch
                  checked={p.sharing}
                  onChange={(next) => onToggle(p.id, next)}
                  labelledBy={labelId}
                />
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[#16110d] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#2c2420] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
          >
            {/* Done */}
            {t("done")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toast (confirms which action was chosen when no handler is supplied)      */
/* -------------------------------------------------------------------------- */

const ACTION_MESSAGES: Record<ActionKey, string> = {
  simulator: "Opening the inheritance simulator…",
  options: "Opening your options…",
  session: "Opening couple session booking…",
};

function Toast({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#16110d] px-4 py-2 text-sm font-medium text-white shadow-lg"
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function CoupleView({
  partners: initialPartners = DEFAULT_PARTNERS,
  agreedOn = "30 Oct 2026",
  onAction,
  onSharingChange,
}: CoupleViewProps) {
  const [partners, setPartners] = useState<Partner[]>(initialPartners);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const t = useTranslations("dashboard.couple");

  const figureLabels: Record<FigureVariant, string> = {
    affected: t("figures.affected"),
    carrier: t("figures.carrier"),
    unchanged: t("figures.unchanged"),
  };
  const outcomeLabels = {
    scd: t("outcomes.scd"),
    carrier: t("outcomes.carrier"),
    none: t("outcomes.none"),
  };
  const toastMessages: Record<ActionKey, string> = {
    simulator: t("toast.simulator"),
    options: t("toast.options"),
    session: t("toast.session"),
  };

  const bothSharing = partners.every((p) => p.sharing);
  const [first, second] = partners;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleToggle = (id: string, next: boolean) => {
    setPartners((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, sharing: next } : p));
      onSharingChange?.(updated);
      return updated;
    });
  };

  const handleAction = (key: ActionKey) => {
    if (onAction) onAction(key);
    // else setToast(ACTION_MESSAGES[key]);
    else setToast(toastMessages[key]);
  };

  return (
    <div className="min-h-screen bg-[#fff6f0] px-6 py-6 font-['Plus_Jakarta_Sans',ui-sans-serif,system-ui,sans-serif] text-[#16110d] antialiased sm:px-6">
      <div className="mx-auto">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
              {/* Couple view */}
              {t("header.title")}
            </h1>
            <p className="mt-1 text-[13px] text-[#6b6159]">
              {/* {bothSharing
                ? `${first.name} and ${second.name} · Both of you agreed to share result summaries on ${agreedOn}`
                : `${first.name} and ${second.name} · Sharing is paused for at least one of you`} */}
              {bothSharing
                ? t("subtitle.agreed", { first: first.name, second: second.name, date: agreedOn })
                : t("subtitle.paused", { first: first.name, second: second.name })}

            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-[#f0e2d8] bg-white px-5 py-2.5 text-sm font-semibold shadow-[0_1px_2px_rgba(120,60,20,0.05)] transition hover:border-[#e8c9b4] hover:bg-[#fffaf6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
          >
            <Shield className="size-4" aria-hidden />
            {/* Manage sharing */}
            {t("header.manage")} 
          </button>
        </header>

        {/* Consent chips */}
        <ul className="mt-5 flex flex-wrap gap-2" aria-label={t("chip.statusAria")}>
          {partners.map((p) => (
            <ConsentChip key={p.id} partner={p} />
          ))}
        </ul>

        {/* Content grid */}
        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_272px]">
          {/* Main card */}
          <section
            aria-labelledby="shared-chances-title"
            className="rounded-3xl border border-[#f6e9df] bg-white p-7 shadow-[0_1px_2px_rgba(120,60,20,0.04),0_8px_28px_rgba(120,60,20,0.05)]"
          >
            {bothSharing ? (
              <>
                <h2
                  id="shared-chances-title"
                  className="text-base font-bold tracking-tight"
                >
                  {/* Your shared chances, for each pregnancy */}
                  {t("main.title")}
                </h2>
                <p className="mt-1.5 text-[13px] text-[#6b6159]">
                  {/* You are both carriers of sickle cell trait (HbAS). */}
                  {t("main.subtitle")}
                </p>

                {/* Figures panel */}
                <div
                  role="img"
                  // aria-label="Four possible outcomes: one child with sickle cell disease, two healthy carriers, one with no changed copy"
                  aria-label={t("figures.aria")}
                  className="mt-5 grid grid-cols-4 gap-2 rounded-2xl bg-[#fff3ea] px-3 pt-5 pb-4"
                >
                  {FIGURES.map((f) => (
                    <div
                      key={f.id}
                      className="flex flex-col items-center gap-2.5 text-center"
                    >
                      <Figure variant={f.variant} />
                      <span className="text-xs leading-tight font-bold">
                        {/* {f.label} */}
                        {figureLabels[f.variant]}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Percentages */}
                <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
                  {OUTCOMES.map((o) => (
                    <div key={o.id} className="flex flex-col items-center">
                      <dd
                        className={`order-1 text-[34px] leading-none font-extrabold tracking-tight tabular-nums ${o.percentClass}`}
                      >
                        {o.percent}%
                      </dd>
                      <dt className="order-2 mt-2 text-xs text-[#6b6159]">
                        {/* {o.percentLabel} */}
                        {outcomeLabels[o.id]}
                      </dt>
                    </div>
                  ))}
                </dl>

                {/* Notice */}
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#f3e4d9] bg-white px-4 py-3">
                  <CircleAlert
                    className="mt-0.5 size-4 shrink-0 text-[#c2410c]"
                    aria-hidden
                  />
                  <p className="text-[13px] leading-relaxed">
                    {/* These chances are the same for <strong>every</strong>{" "}
                    pregnancy. Having one affected child doesn&rsquo;t make the
                    next one less or more likely. */}
                    {t.rich("main.notice", { b: (c) => <strong>{c}</strong> })}
                  </p>
                </div>

                <p className="mt-5 text-xs text-[#6b6159]">
                  {/* This is information, not a recommendation. Every option is
                  valid, and the decision is yours. */}
                  {t("main.info")}
                </p>
              </>
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center text-center">
                <span className="grid size-12 place-items-center rounded-full bg-[#fff3ea]">
                  <Shield className="size-5 text-[#c2410c]" aria-hidden />
                </span>
                <h2
                  id="shared-chances-title"
                  className="mt-4 text-base font-bold tracking-tight"
                >
                  {/* Couple view is paused */}
                  {t("main.pausedTitle")}
                </h2>
                <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-[#6b6159]">
                  {/* Shared chances show once both of you are sharing result
                  summaries. You can change this at any time. */}
                  {t("main.pausedBody")}
                </p>
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="mt-5 rounded-full bg-[#16110d] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#2c2420] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
                >
                  {t("header.manage")}
                </button>
              </div>
            )}
          </section>

          {/* Side actions */}
          <nav aria-label={t("actions.navAria")} className="flex flex-col gap-3 self-start">
            {ACTIONS.map((a) => (
              <ActionCard key={a.key} data={a} onSelect={handleAction} />
            ))}
          </nav>
        </div>
      </div>

      {dialogOpen && (
        <ManageSharingDialog
          partners={partners}
          onToggle={handleToggle}
          onClose={() => setDialogOpen(false)}
        />
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}