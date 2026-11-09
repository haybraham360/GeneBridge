import { ChevronRight, Compass, MapPin, MessagesSquare, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * "Explore at your own pace": the places not already in the tool spotlight
 * above. Listed in the same order as the side menu, all with equal weight.
 */
export default function ExplorePanel() {
  const t = useTranslations("dashboard.explorePanel");

  const items = [
    { key: "conditions", label: t("conditions"), icon: Search, href: "/dashboard/conditions" },
    { key: "talk", label: t("talk"), icon: MessagesSquare, href: "/dashboard/talk" },
    { key: "options", label: t("options"), icon: Compass, href: "/dashboard/options" },
    { key: "services", label: t("services"), icon: MapPin, href: "/dashboard/services" },
  ];

  return (
    <section aria-labelledby="explore-panel-title" className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 id="explore-panel-title" className="text-[20px] font-extrabold leading-none tracking-[-0.01em]">
        {t("title")}
      </h2>
      <ul className="mt-4 flex flex-col gap-2">
        {items.map(({ key, label, icon: Icon, href }) => (
          <li key={key}>
            <Link
              href={href}
              className="group flex min-h-13 items-center gap-3 rounded-tile border border-transparent bg-brand-tint-soft/70 px-3.5 py-2.5 text-[14.5px] font-semibold text-ink no-underline transition-[background-color,border-color,translate] duration-300 hover:border-brand-ring hover:bg-brand-tint-soft"
            >
              <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-lg bg-surface text-brand-text shadow-[0_1px_2px_rgba(60,30,10,0.08)] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                <Icon className="size-4.5" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">{label}</span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 flex-none text-ink/40 transition-[translate,color] duration-300 group-hover:translate-x-0.5 group-hover:text-brand-text rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                strokeWidth={2.2}
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
