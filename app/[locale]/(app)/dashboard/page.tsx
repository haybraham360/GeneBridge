import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import { getFormatter, getTranslations } from "next-intl/server";

import type { CSSProperties } from "react";
import { ListenPill } from "@/components/ui/ListenPill";
import ToolSpotlight from "@/components/dashboard/ToolSpotlight";
import CareJourney from "@/components/dashboard/CareJourney";
import SummaryCards from "@/components/dashboard/SummaryCards";
import AskGeneBridge from "@/components/dashboard/AskGeneBridge";
import ExplorePanel from "@/components/dashboard/ExplorePanel";
import { PatientNotifications } from "@/components/notifications/PatientNotifications";
import { NextSession } from "@/components/booking/NextSession";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { loadNextBooking } from "@/lib/booking/server";
import { careView } from "@/lib/care/display";
import { loadCareFacts } from "@/lib/care/tracker";
import { loadNotifications } from "@/lib/notifications/server";
import { currentPerson } from "@/lib/profile/currentPerson";
import { createClient, getAuthClaims } from "@/lib/supabase/server";
import { AddResultPanel } from "@/components/home/AddResultPanel";
import { NotDiagnosisBanner } from "@/components/home/NotDiagnosisBanner";
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
  const supabase = await createClient();
  const [t, tc, format, facts, notifications, claims, person, path, nextBooking] = await Promise.all([
    getTranslations({ locale, namespace: "dashboard" }),
    getTranslations({ locale, namespace: "common" }),
    getFormatter({ locale }),
    loadCareFacts(supabase),
    loadNotifications(supabase),
    getAuthClaims(supabase),
    currentPerson(supabase),
    loadUserPath(supabase),
    // The next live session (task 15), on both versions of Home.
    loadNextBooking(supabase),
  ]);
  const catalogue = listConditions(locale);

  // One Home for everyone (design Home). Without a result yet (exploring
  // path, task 11) the cards show empty states, the "not a diagnosis" banner
  // stays on top (guardrail 14) and they can add a result here.
  const exploring = path.path === "exploring";
  const summary = await loadHomeSummary(supabase, path);
  const byId = new Map(catalogue.map((c) => [c.id, c]));
  const followedItems = path.followed.flatMap((f) => {
    const c = byId.get(f.conditionId);
    return c ? [{ id: c.id, title: c.title, pattern: c.inheritance ? t(`explore.patterns.${c.inheritance}`) : null, reason: f.reason }] : [];
  });
  // Care journey and counsellor updates come from the patient's own data (task 07).
  const care = careView(facts, t as unknown as Parameters<typeof careView>[1], format);
  const userId = claims?.sub;
  const greeting = person.firstName ? t("home.greeting", { name: person.firstName }) : t("home.greetingNoName");
  // What Listen reads: the header and where they are in their care journey.
  const currentStep = care.steps.find((s) => s.status === "current");
  const listenText = [
    greeting,
    t("home.subtitle"),
    `${t("careJourney.title")}: ${t("careJourney.progress", { current: care.current, total: care.steps.length })}`,
    currentStep ? `${currentStep.title}. ${currentStep.meta}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  const order = (i: number) => ({ "--i": i }) as CSSProperties;

  return (
    <div className="min-w-0 px-[clamp(16px,3vw,40px)] pt-6 pb-12 sm:pt-8">
      <div className="mx-auto flex max-w-page flex-col gap-6">
        {/* lg:pe-14 keeps Listen clear of the bell in the top corner. */}
        <header className="rise-in flex flex-wrap items-end justify-between gap-4 lg:pe-14" style={order(0)}>
          <div className="min-w-0">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.01em] text-ink sm:text-[34px]">{greeting}</h1>
            <p className="mt-1.5 text-[15px] leading-snug text-muted">{t("home.subtitle")}</p>
          </div>
          <ListenPill text={listenText} play={t("shared.listen")} stop={tc("listen.stop")} />
        </header>

        {exploring ? <NotDiagnosisBanner path={path} catalogue={catalogue} /> : null}

        {userId ? <PatientNotifications items={notifications} userId={userId} /> : null}
        {userId ? <LiveRefresh channel={`home-bookings-${userId}`} watch={[{ table: "bookings", filter: `patient_id=eq.${userId}` }]} /> : null}

        <CareJourney steps={care.steps} current={care.current} style={order(1)} />
        {nextBooking ? <NextSession booking={nextBooking} /> : null}

        <section aria-label={t("sections.status")} className="rise-in" style={order(2)}>
          <SummaryCards summary={summary} catalogue={catalogue} />
        </section>

        {exploring && addResult === "1" ? <AddResultPanel /> : null}

        <ToolSpotlight style={order(3)} />

        <div className="rise-in grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]" style={order(4)}>
          <AskGeneBridge canUseFollowed={path.followed.length > 0} />
          <ExplorePanel />
        </div>

        {followedItems.length ? (
          <FollowingCard
            followed={followedItems}
            catalogue={catalogue}
            focusId={path.focus?.conditionId ?? null}
            title={exploring ? undefined : t("explore.resultFollowing.title")}
          />
        ) : null}
      </div>
    </div>
  );
}
