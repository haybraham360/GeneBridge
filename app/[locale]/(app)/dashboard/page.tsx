import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import { getFormatter, getTranslations } from "next-intl/server";

import { Volume1 } from "lucide-react";
import CareJourney from "@/components/dashboard/CareJourney";
import SummaryCards from "@/components/dashboard/SummaryCards";
import AskGeneBridge from "@/components/dashboard/AskGeneBridge";
import ExplorePanel from "@/components/dashboard/ExplorePanel";
import { PatientNotifications } from "@/components/notifications/PatientNotifications";
import { careView } from "@/lib/care/display";
import { loadCareFacts } from "@/lib/care/tracker";
import { loadNotifications } from "@/lib/notifications/server";
import { currentPerson } from "@/lib/profile/currentPerson";
import { createClient } from "@/lib/supabase/server";
import { ExploreHome } from "@/components/home/ExploreHome";
import { FollowingCard } from "@/components/home/FollowingCard";
import { listConditions } from "@/lib/conditions/catalogue";
import { loadUserPath } from "@/lib/user/path";
import { loadHomeSummary } from "@/lib/home/summary";

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'dashboard') : {};
}

export default async function Page({ params, searchParams }: PageProps<'/[locale]/dashboard'>) {
  const { locale } = await params;
  const { addResult } = await searchParams;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const supabase = await createClient();
  const [format, facts, notifications, { data: claims }, person, path] = await Promise.all([
    getFormatter({ locale }),
    loadCareFacts(supabase),
    loadNotifications(supabase),
    supabase.auth.getClaims(),
    currentPerson(supabase),
    loadUserPath(supabase),
  ]);
  const catalogue = listConditions(locale);

  // Exploring path (task 11): no result yet; Home is shaped by the
  // conditions they follow, and never presents one as a diagnosis.
  if (path.path === "exploring") {
    return (
      <ExploreHome
        locale={locale}
        firstName={person.firstName}
        path={path}
        catalogue={catalogue}
        openClaim={addResult === "1"}
      />
    );
  }
  const summary = await loadHomeSummary(supabase, path);
  const byId = new Map(catalogue.map((c) => [c.id, c]));
  const followedItems = path.followed.flatMap((f) => {
    const c = byId.get(f.conditionId);
    return c ? [{ id: c.id, title: c.title, pattern: c.inheritance ? t(`explore.patterns.${c.inheritance}`) : null, reason: f.reason }] : [];
  });
  // Care journey and counsellor updates come from the patient's own data (task 07).
  const care = careView(facts, t as unknown as Parameters<typeof careView>[1], format);
  const userId = claims?.claims?.sub;
//   return <PlaceholderPage locale={locale} screen="dashboard" />;
  return (
        <main className="min-w-0 min-h-0 overflow-auto flex-1 px-10 pb-10 pt-9">
            <div className="mx-auto">
            <header className="flex items-start justify-between">
                <div>
                <h1 className="text-[32px] text-ink font-extrabold leading-7.5 tracking-[-0.01em]">
                    {person.firstName ? t("home.greeting", { name: person.firstName }) : t("home.greetingNoName")}
                </h1>
                <p className="mt-3.5 text-[15px] leading-3.5 text-neutral-500">
                    {t("home.subtitle")}
                </p>
                </div>
                <button className="mt-3.5 flex items-center gap-1.75 rounded-full border border-neutral-200 bg-white px-6.5 py-3 text-[15px] font-bold shadow-card cursor-pointer hover:bg-brand/5">
                <Volume1 className="h-4 w-4" strokeWidth={2.75} />
                    {t("shared.listen")}
                </button>
            </header>

            <div className="mt-4.25 flex flex-col gap-4.5">
                {userId ? <PatientNotifications items={notifications} userId={userId} /> : null}
                <CareJourney steps={care.steps} current={care.current} />
                <SummaryCards summary={summary} catalogue={catalogue} />
                <div className="grid grid-cols-[1.75fr_1fr] gap-5">
                <AskGeneBridge canUseFollowed={path.followed.length > 0} />
                <ExplorePanel />
                </div>
                {followedItems.length ? (
                  <FollowingCard
                    followed={followedItems}
                    catalogue={catalogue}
                    focusId={path.focus?.conditionId ?? null}
                    title={t("explore.resultFollowing.title")}
                  />
                ) : null}
            </div>
            </div>
        </main>
    )
}
