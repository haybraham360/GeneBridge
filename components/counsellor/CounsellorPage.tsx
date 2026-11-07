"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { logDirectoryViewed } from "@/app/[locale]/(app)/dashboard/counsellor/actions";
import { BookingPanel } from "@/components/booking/BookingPanel";
import { MyBookings } from "@/components/booking/MyBookings";
import { DirectoryList } from "@/components/directory/DirectoryList";
import { OffersPanel } from "@/components/directory/OffersPanel";
import type { RequestOffer } from "@/lib/booking/server";
import type { PatientBooking } from "@/lib/booking/types";
import type { DirectoryEntry } from "@/lib/directory/sort";

type StepStatus = "done" | "current" | "upcoming" | "optional";
/** A referral-path step from the patient's own data (lib/care), already translated. */
type LiveStep = { title: string; meta: string; status: StepStatus };

type Props = {
  /** Verified professionals accepting patients, in the patient's order (lib/directory). */
  entries: DirectoryEntry[];
  bookings: PatientBooking[];
  cutoffHours: number;
  offers: RequestOffer[];
  /** The referral path from the patient's own data (lib/care). */
  path: LiveStep[];
  /** From /counsellor?topic=family (task 09): "a family member joins" is pre-ticked. */
  familyTopic?: boolean;
  /** An open escalation request (?request=…): the booking answers it. */
  requestId?: string | null;
  /** From /counsellor?with=… (a profile page or chat). */
  initialProfessionalId?: string | null;
};

/**
 * Counsellor & referral (design: Counsellor), on real data: the directory,
 * the booking panel, the patient's bookings, offers on their requests and
 * the referral path. Nothing about the patient is shared until they confirm
 * a booking with sharing ticked.
 */
export default function CounsellorPage({ entries, bookings, cutoffHours, offers, path, familyTopic = false, requestId = null, initialProfessionalId = null }: Props) {
  const t = useTranslations("dashboard.counsellor");
  const td = useTranslations("directory");
  const [selectedId, setSelectedId] = useState<string | null>(
    entries.find((e) => e.userId === initialProfessionalId)?.userId ?? entries[0]?.userId ?? null,
  );
  const selected = entries.find((e) => e.userId === selectedId) ?? null;
  const panel = useRef<HTMLDivElement>(null);

  // directory_viewed: once per visit, counts only.
  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    void logDirectoryViewed(entries.length);
  }, [entries.length]);

  return (
    <div className="min-w-0 px-[clamp(16px,3vw,40px)] pb-10 pt-7 sm:pt-9">
      <div className="mx-auto flex flex-col gap-5">
        <header>
          <h1 className="text-[32px] font-extrabold leading-8.5 tracking-[-0.01em] text-ink">{t("header.title")}</h1>
          <p className="mt-2 text-[15px] leading-5 text-neutral-500">{t("header.subtitle")}</p>
        </header>

        <div role="note" className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white px-5 py-4 shadow-card">
          <Info className="h-4 w-4 shrink-0 text-[#C2410C]" strokeWidth={1.8} />
          <p className="text-[14px] leading-5 text-neutral-700">{t("notice")}</p>
        </div>

        {requestId && offers.length === 0 ? (
          <div role="status" className="rounded-2xl bg-[#FFF1E7] px-5 py-4 text-[14px]">
            <p className="font-bold">{td("request.title")}</p>
            <p className="mt-1 text-neutral-700">{td("request.body")}</p>
          </div>
        ) : null}
        <OffersPanel offers={offers} />

        <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-5">
            <h2 className="text-[20px] font-extrabold leading-none text-ink">
              {td("choose")}
              {entries.length ? <span className="ms-2 text-[13px] font-semibold text-neutral-500">{td("count", { count: entries.length })}</span> : null}
            </h2>

            <DirectoryList
              entries={entries}
              selectedId={selectedId}
              onSelect={(e) => {
                setSelectedId(e.userId);
                // On phones the panel is below the list.
                panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />

            <MyBookings bookings={bookings} cutoffHours={cutoffHours} />

            <section className="rounded-2xl bg-white p-6 shadow-card">
              <h2 className="text-[18px] font-extrabold leading-none text-ink">{t("referral.title")}</h2>
              <ol className="mt-5">
                {path.map((s, i) => {
                  const last = i === path.length - 1;
                  return (
                    <li key={s.title} className="relative flex gap-3.5 pb-4 last:pb-0" data-status={s.status}>
                      {!last && <span aria-hidden className="absolute start-3 top-6 bottom-0 w-px ltr:-translate-x-1/2 rtl:translate-x-1/2 bg-neutral-300" />}
                      <Marker status={s.status} />
                      <div>
                        <p className="text-[14px] font-bold leading-4.5 text-ink">{s.title}</p>
                        <p className="text-[12px] leading-4 text-neutral-500">{s.meta}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E5ECF6] px-3.5 py-1.5 text-[12px] text-[#1E3A8A]">
                <Check className="h-3 w-3" strokeWidth={2.5} />
                {t("referral.record")}
              </p>
            </section>
          </div>

          <div ref={panel} className="scroll-mt-4">
            <BookingPanel
              professional={selected ? { userId: selected.userId, displayName: selected.displayName } : null}
              familyTopic={familyTopic}
              requestId={requestId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Marker({ status }: { status: StepStatus }) {
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
  if (status === "optional") return <span className={`${base} border border-dashed border-neutral-400 bg-white`} />;
  return <span className={`${base} border border-neutral-400 bg-white`} />;
}
