"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

/* ---------- types ---------- */

/** One row of "Who can see my result", already labelled on the server. */
export type AccessRow = {
  key: string;
  name: string;
  role: string;
  /** Labels of what they can see; empty when nothing is shared. */
  canSee: string[];
  since: string | null;
  action:
    | { kind: "revoke"; granteeId: string }
    | { kind: "withdrawCouple" }
    | { kind: "setUpCouple" }
    | null;
};

type LogItem = { text: string; when: string };

type Props = {
  access: AccessRow[];
  /** Shown above the table when nobody has access. */
  accessEmpty: string;
  /** Real reads of the person's shared data, from access_log (task 07). */
  accessLog: LogItem[];
  accessLogEmpty: string;
  /** The family messages this person sent (task 08). Never says who opened them. */
  familyNotices: LogItem[];
  familyNoticesEmpty: string;
  consentHistory: LogItem[];
  consentHistoryEmpty: string;
  /** Server actions. */
  onRevoke: (granteeId: string) => Promise<{ ok: boolean }>;
  onWithdrawCouple: () => Promise<{ ok: boolean }>;
};

const card = "rounded-2xl bg-white p-6 shadow-card";
const cardTitle = "text-[18px] font-extrabold leading-none text-ink";
const dangerButton =
  "cursor-pointer rounded-full border border-red-600 bg-white px-5 py-2 text-[13px] font-bold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60";
const ghostButton =
  "inline-flex cursor-pointer items-center rounded-full border border-neutral-300 bg-white px-5 py-2 text-[13px] font-bold text-ink no-underline hover:bg-brand/5";

/* ---------- page ---------- */

export default function PrivacyPage({
  access,
  accessEmpty,
  accessLog,
  accessLogEmpty,
  familyNotices,
  familyNoticesEmpty,
  consentHistory,
  consentHistoryEmpty,
  onRevoke,
  onWithdrawCouple,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const t = useTranslations("dashboard.privacy");

  const run = (key: string, action: () => Promise<{ ok: boolean }>) => {
    setPendingKey(key);
    setFailed(false);
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false }));
      setPendingKey(null);
      if (!result.ok) return setFailed(true);
      // Revoking takes effect immediately; show the new state.
      router.refresh();
    });
  };

  const hasAccess = access.some((r) => r.canSee.length > 0);

  return (
    <div className="min-w-0 px-[clamp(16px,3vw,40px)] pb-10 pt-7 sm:pt-9">
      <div className="mx-auto flex flex-col gap-5">
        {/* Header */}
        <header>
          <h1 className="text-[32px] font-extrabold leading-8.5 tracking-[-0.01em] text-ink">{t("header.title")}</h1>
          <p className="mt-2 text-[15px] leading-5 text-neutral-500">{t("header.subtitle")}</p>
        </header>

        {/* Who can see my result */}
        <section className={card} data-testid="who-can-see">
          <h2 className={cardTitle}>{t("who.title")}</h2>
          {!hasAccess ? <p className="mt-3 text-[13px] text-neutral-600">{accessEmpty}</p> : null}

          <div className="relative mt-5 overflow-x-auto">
            <table className="w-full min-w-140 border-collapse text-start">
              <thead>
                <tr className="text-[12px] font-medium text-neutral-600">
                  <th scope="col" className="w-[34%] pb-3 text-start font-medium">{t("who.person")}</th>
                  <th scope="col" className="w-[25%] pb-3 text-start font-medium">{t("who.canSee")}</th>
                  <th scope="col" className="pb-3 text-start font-medium">{t("who.since")}</th>
                  <th scope="col" className="pb-3">
                    <span className="sr-only">{t("who.action")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {access.map((r) => (
                  <tr key={r.key} className="border-t border-neutral-200" data-testid="access-row">
                    <td className="py-3.5">
                      <p className="text-[14px] font-bold leading-4.5 text-ink">{r.name}</p>
                      <p className="text-[12px] leading-4 text-neutral-500">{r.role}</p>
                    </td>
                    <td className="py-3.5">
                      {r.canSee.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {r.canSee.map((label) => (
                            <span key={label} className="rounded-full bg-[#FFEDE2] px-2.5 py-1 text-[11px] font-bold text-[#9A3412]">
                              {label}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-[12px] text-neutral-600">{t("who.none")}</span>
                      )}
                    </td>
                    <td className="py-3.5 text-[13px] text-neutral-700">{r.since ?? "—"}</td>
                    <td className="py-3.5 text-end">
                      {r.action?.kind === "revoke" ? (
                        <button
                          type="button"
                          disabled={pendingKey === r.key}
                          onClick={() => {
                            const granteeId = (r.action as { granteeId: string }).granteeId;
                            run(r.key, () => onRevoke(granteeId));
                          }}
                          aria-label={t("who.revokeAria", { name: r.name })}
                          className={dangerButton}
                        >
                          {t("who.revoke")}
                        </button>
                      ) : r.action?.kind === "withdrawCouple" ? (
                        <button
                          type="button"
                          disabled={pendingKey === r.key}
                          onClick={() => run(r.key, onWithdrawCouple)}
                          aria-label={t("who.revokeAria", { name: r.name })}
                          className={dangerButton}
                        >
                          {t("who.revoke")}
                        </button>
                      ) : r.action?.kind === "setUpCouple" ? (
                        <Link
                          href="/dashboard/couple/consent"
                          aria-label={t("who.shareCoupleAria", { name: r.name })}
                          className={ghostButton}
                        >
                          {t("who.share")}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {failed ? (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-red-700">
              {t("revokeError")}
            </p>
          ) : null}
        </section>

        {/* Log + notifications */}
        <div className="grid gap-5 md:grid-cols-2">
          <TimelineCard
            title={t("log.title")}
            subtitle={t("log.subtitle")}
            items={accessLog}
            empty={accessLogEmpty}
            testId="access-log"
          />
          <TimelineCard
            title={t("notifications.title")}
            subtitle={t("notifications.subtitle")}
            items={familyNotices}
            empty={familyNoticesEmpty}
            testId="family-notices"
          />
        </div>

        {/* Data + consent history */}
        <div className="grid gap-5 md:grid-cols-2">
          <section className={card}>
            <h2 className={cardTitle}>{t("data.title")}</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-brand/5 p-3.5">
                <h3 className="text-[13px] font-bold text-ink">{t("data.store")}</h3>
                <p className="mt-1.5 text-[12px] leading-4.5 text-neutral-500">{t("data.storeBody")}</p>
              </div>
              <div className="rounded-xl bg-brand/5 p-3.5">
                <h3 className="text-[13px] font-bold text-ink">{t("data.never")}</h3>
                <p className="mt-1.5 text-[12px] leading-4.5 text-neutral-500">{t("data.neverBody")}</p>
                {/* Task 12: photographed reports. */}
                <p className="mt-1.5 text-[12px] leading-4.5 text-neutral-500">{t("data.photos")}</p>
                {/* Care near you: location is used once, never stored. */}
                <p className="mt-1.5 text-[12px] leading-4.5 text-neutral-500">{t("data.location")}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-[13px] font-bold text-ink hover:bg-brand/5"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                {t("data.download")}
              </button>

              {confirmDelete ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="cursor-pointer rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-brand/5"
                  >
                    {t("data.cancel")}
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-full bg-red-700 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-red-800"
                  >
                    {t("data.confirmDelete")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="cursor-pointer rounded-full border border-red-600 bg-white px-5 py-2.5 text-[13px] font-bold text-red-700 hover:bg-red-50"
                >
                  {t("data.delete")}
                </button>
              )}
            </div>
          </section>

          <TimelineCard
            title={t("consent.title")}
            items={consentHistory}
            empty={consentHistoryEmpty}
            testId="consent-history"
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

function TimelineCard({
  title,
  subtitle,
  items,
  empty,
  testId,
}: {
  title: string;
  subtitle?: string;
  items: LogItem[];
  empty: string;
  testId?: string;
}) {
  return (
    <section className={card}>
      <h2 className={cardTitle}>{title}</h2>
      {subtitle && <p className="mt-2 text-[12px] leading-4 text-neutral-500">{subtitle}</p>}
      {items.length === 0 ? (
        <p className="mt-3 border-t border-neutral-200 pt-3 text-[13px] text-neutral-600">{empty}</p>
      ) : null}
      <ul className={subtitle ? "mt-3" : "mt-4"} data-testid={testId}>
        {items.map((it, i) => (
          <li
            key={`${i}-${it.text}`}
            className={`flex gap-3 py-2.5 ${i > 0 || subtitle ? "border-t border-neutral-200" : ""} ${
              !subtitle && i === 0 ? "border-t" : ""
            }`}
          >
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <div>
              <p className="text-[13px] leading-4.5 text-ink">{it.text}</p>
              <p className="text-[11px] leading-4 text-neutral-500">{it.when}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
