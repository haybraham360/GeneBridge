"use client";

import { useState } from "react";
import { Download } from "lucide-react";

/* ---------- content ---------- */

type Access = {
  id: string;
  name: string;
  role: string;
  level: "Summary only" | "Full report" | null;
  since: string | null;
};

const initialAccess: Access[] = [
  { id: "khalid", name: "Khalid", role: "Partner", level: "Summary only", since: "30 Oct 2026" },
  { id: "amaka", name: "Dr. Amaka Okoro", role: "Genetic counsellor", level: "Full report", since: "3 Nov 2026" },
  { id: "family", name: "Family members", role: "Relatives", level: null, since: null },
];

const accessLog = [
  { text: "Dr. Amaka Okoro viewed your full report", when: "3 Nov, 10:14" },
  { text: "Khalid viewed your summary", when: "30 Oct, 21:02" },
  { text: "You downloaded your result", when: "29 Oct, 18:40" },
];

const notifications = [
  { text: "Sent anonymously to 2 relatives", when: "1 Nov · your result was not included" },
  { text: "1 relative opened the testing information", when: "2 Nov" },
];

const consentHistory = [
  { text: "Agreed to the privacy terms", when: "27 Oct 2026" },
  { text: "Unlocked couple view with Khalid (summary only)", when: "30 Oct 2026" },
  { text: "Shared full report with Dr. Amaka Okoro", when: "3 Nov 2026" },
];

const card = "rounded-2xl bg-white p-6 shadow-card";
const cardTitle = "text-[18px] font-extrabold leading-none text-ink";

/* ---------- page ---------- */

export default function PrivacyPage() {
  const [access, setAccess] = useState<Access[]>(initialAccess);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const revoke = (id: string) =>
    setAccess((rows) =>
      rows.map((r) => (r.id === id ? { ...r, level: null, since: null } : r)),
    );

  const share = (id: string) =>
    setAccess((rows) =>
      rows.map((r) =>
        r.id === id ? { ...r, level: "Summary only", since: "Today" } : r,
      ),
    );

  return (
    <div className="min-w-0 px-10 pb-10 pt-9">
      <div className="mx-auto flex flex-col gap-5">
        {/* Header */}
        <header>
          <h1 className="text-[32px] font-extrabold leading-8.5 tracking-[-0.01em] text-ink">
            Privacy &amp; consent
          </h1>
          <p className="mt-2 text-[15px] leading-5 text-neutral-500">
            You decide who sees what. Changes take effect immediately.
          </p>
        </header>

        {/* Who can see my result */}
        <section className={card}>
          <h2 className={cardTitle}>Who can see my result</h2>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-140 border-collapse text-left">
              <thead>
                <tr className="text-[12px] font-medium text-neutral-600">
                  <th scope="col" className="w-[34%] pb-3 font-medium">Person</th>
                  <th scope="col" className="w-[25%] pb-3 font-medium">Can see</th>
                  <th scope="col" className="pb-3 font-medium">Since</th>
                  <th scope="col" className="pb-3">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {access.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-200">
                    <td className="py-3.5">
                      <p className="text-[14px] font-bold leading-4.5 text-ink">
                        {r.name}
                      </p>
                      <p className="text-[12px] leading-4 text-neutral-500">
                        {r.role}
                      </p>
                    </td>
                    <td className="py-3.5">
                      {r.level ? (
                        <span className="rounded-full bg-[#FFEDE2] px-2.5 py-1 text-[11px] font-bold text-[#9A3412]">
                          {r.level}
                        </span>
                      ) : (
                        <span className="text-[12px] text-neutral-600">
                          Nothing shared
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-[13px] text-neutral-700">
                      {r.since ?? "—"}
                    </td>
                    <td className="py-3.5 text-right">
                      {r.level ? (
                        <button
                          type="button"
                          onClick={() => revoke(r.id)}
                          aria-label={`Revoke access for ${r.name}`}
                          className="cursor-pointer rounded-full border border-red-600 bg-white px-5 py-2 text-[13px] font-bold text-red-700 hover:bg-red-50"
                        >
                          Revoke
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => share(r.id)}
                          aria-label={`Share with ${r.name}`}
                          className="cursor-pointer rounded-full border border-neutral-300 bg-white px-5 py-2 text-[13px] font-bold text-ink hover:bg-brand/5"
                        >
                          Share
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Log + notifications */}
        <div className="grid gap-5 md:grid-cols-2">
          <TimelineCard
            title="Access log"
            subtitle="Every time someone opens your result."
            items={accessLog}
          />
          <TimelineCard
            title="Family notifications"
            subtitle="Messages you sent to relatives through GeneBridge."
            items={notifications}
          />
        </div>

        {/* Data + consent history */}
        <div className="grid gap-5 md:grid-cols-2">
          <section className={card}>
            <h2 className={cardTitle}>Your data</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-brand/5 p-3.5">
                <h3 className="text-[13px] font-bold text-ink">We store</h3>
                <p className="mt-1.5 text-[12px] leading-4.5 text-neutral-500">
                  Your result interpretation, consents, bookings and family map.
                </p>
              </div>
              <div className="rounded-xl bg-brand/5 p-3.5">
                <h3 className="text-[13px] font-bold text-ink">We never store</h3>
                <p className="mt-1.5 text-[12px] leading-4.5 text-neutral-500">
                  Your raw genome or any relative&apos;s test result.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-[13px] font-bold text-ink hover:bg-brand/5"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Download my data
              </button>

              {confirmDelete ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="cursor-pointer rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-brand/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-full bg-red-700 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-red-800"
                  >
                    Yes, delete everything
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="cursor-pointer rounded-full border border-red-600 bg-white px-5 py-2.5 text-[13px] font-bold text-red-700 hover:bg-red-50"
                >
                  Delete my account
                </button>
              )}
            </div>
          </section>

          <TimelineCard title="Consent history" items={consentHistory} />
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
}: {
  title: string;
  subtitle?: string;
  items: { text: string; when: string }[];
}) {
  return (
    <section className={card}>
      <h2 className={cardTitle}>{title}</h2>
      {subtitle && (
        <p className="mt-2 text-[12px] leading-4 text-neutral-500">{subtitle}</p>
      )}
      <ul className={subtitle ? "mt-3" : "mt-4"}>
        {items.map((it, i) => (
          <li
            key={it.text}
            className={`flex gap-3 py-2.5 ${i > 0 || subtitle ? "border-t border-neutral-200" : ""} ${
              !subtitle && i === 0 ? "border-t" : ""
            }`}
          >
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
            />
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