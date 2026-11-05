import { ArrowRight } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { CatalogueCondition } from "@/lib/conditions/search";
import type { HomeSummary } from "@/lib/home/summary";

type Card = { key: string; pill: string; pillClass: string; title: string; body: string; link: string; href: string };

const pills = {
  result: "bg-[#FFEDE2] text-[#9A3412]",
  couple: "bg-[#E7F6EC] text-[#166534]",
  coupleWaiting: "bg-[#FFF1E7] text-[#9A3412]",
  appointment: "bg-[#E5ECF6] text-[#1E3A8A]",
};

/**
 * The Home cards (design Home): built from the signed-in person's own
 * findings, couple link and booking. Condition names come from the
 * catalogue; nothing is a demo value.
 */
export default async function SummaryCards({ summary, catalogue }: { summary: HomeSummary; catalogue: CatalogueCondition[] }) {
  const t = await getTranslations("dashboard.summaryCards");
  const format = await getFormatter();
  const name = (id: string) => catalogue.find((c) => c.id === id)?.title ?? id;
  const list = (ids: string[]) => format.list(ids.map(name), { type: "conjunction" });

  const r = summary.result;
  const result: Card =
    r.kind === "carrier"
      ? {
          key: "result",
          pill: t("result.pill"),
          pillClass: pills.result,
          title: r.conditionIds.length === 1 ? t("result.carrierOne", { condition: name(r.conditionIds[0]) }) : t("result.carrierMany", { count: r.conditionIds.length }),
          body: r.conditionIds.length === 1 ? t("result.healthyOne") : t("result.healthy", { list: list(r.conditionIds) }),
          link: t("result.link"),
          href: "/dashboard/results",
        }
      : r.kind === "affected"
        ? { key: "result", pill: t("result.pill"), pillClass: pills.result, title: t("result.affected"), body: t("result.affectedBody"), link: t("result.linkCounsellor"), href: "/dashboard/counsellor" }
        : r.kind === "none_found"
          ? { key: "result", pill: t("result.pill"), pillClass: pills.result, title: t("result.noneFound"), body: t("result.noneFoundBody"), link: t("result.link"), href: "/dashboard/results" }
          : r.kind === "flagged"
            ? // Guardrail 4: a flagged result is never explained here.
              { key: "result", pill: t("result.pill"), pillClass: pills.result, title: t("result.flagged"), body: t("result.flaggedBody"), link: t("result.linkCounsellor"), href: "/dashboard/counsellor" }
            : { key: "result", pill: t("result.pill"), pillClass: pills.result, title: t("result.missing"), body: t("result.missingBody"), link: t("result.linkAdd"), href: "/onboarding" };

  const c = summary.couple;
  const couple: Card =
    c.kind === "shared"
      ? {
          key: "couple",
          pill: t("couple.pillUnlocked"),
          pillClass: pills.couple,
          title: c.sharedConditionIds.length === 1 ? t("couple.sharedOne") : t("couple.sharedMany", { count: c.sharedConditionIds.length }),
          body: c.partner ? t("couple.sharedBody", { partner: c.partner }) : t("couple.sharedBodyNoName"),
          link: t("couple.link"),
          href: "/dashboard/couple",
        }
      : c.kind === "none_shared"
        ? { key: "couple", pill: t("couple.pillUnlocked"), pillClass: pills.couple, title: t("couple.noneShared"), body: t("couple.noneSharedBody"), link: t("couple.linkReview"), href: "/dashboard/couple" }
        : c.kind === "consent_missing"
          ? { key: "couple", pill: t("couple.pill"), pillClass: pills.coupleWaiting, title: t("couple.consent"), body: t("couple.consentBody"), link: t("couple.linkReview"), href: "/dashboard/couple" }
          : c.kind === "result_missing"
            ? { key: "couple", pill: t("couple.pill"), pillClass: pills.coupleWaiting, title: t("couple.resultMissing"), body: t("couple.resultMissingBody"), link: t("couple.linkReview"), href: "/dashboard/couple" }
            : c.kind === "flagged"
              ? { key: "couple", pill: t("couple.pill"), pillClass: pills.coupleWaiting, title: t("couple.flagged"), body: t("couple.flaggedBody"), link: t("couple.linkCounsellor"), href: "/dashboard/counsellor" }
              : { key: "couple", pill: t("couple.pill"), pillClass: pills.coupleWaiting, title: t("couple.noPartner"), body: t("couple.noPartnerBody"), link: t("couple.linkReview"), href: "/dashboard/couple" };

  const a = summary.appointment;
  const appointment: Card = a
    ? {
        key: "appointment",
        pill: t("appointment.pill"),
        pillClass: pills.appointment,
        title: a.counsellor ?? t("appointment.counsellorFallback"),
        body: t("appointment.body", {
          when: format.dateTime(new Date(a.startsAt), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
          format: t(`appointment.${a.format}`),
        }),
        link: t("appointment.link"),
        href: "/dashboard/counsellor",
      }
    : { key: "appointment", pill: t("appointment.pill"), pillClass: pills.appointment, title: t("appointment.none"), body: t("appointment.noneBody"), link: t("appointment.linkBook"), href: "/dashboard/counsellor" };

  return (
    <section data-testid="home-summary" className="grid gap-5 lg:grid-cols-3">
      {[result, couple, appointment].map((card) => (
        <article key={card.key} className="flex flex-col rounded-2xl bg-white py-6 ps-6 pe-8 shadow-card">
          <span className={`w-fit rounded-full px-3 py-1 text-[12px] leading-none font-bold ${card.pillClass}`}>{card.pill}</span>
          <h3 className="mt-2.5 text-[22px] leading-6 font-bold">{card.title}</h3>
          <p className="my-3 text-[15px] leading-5 text-neutral-500">{card.body}</p>
          <Link href={card.href} className="mt-auto flex items-center gap-1.25 text-[15px] font-extrabold text-[#C2410C]">
            {card.link}
            <ArrowRight aria-hidden="true" className="h-3 w-3 rtl:-scale-x-100" strokeWidth={1.8} />
          </Link>
        </article>
      ))}
    </section>
  );
}
