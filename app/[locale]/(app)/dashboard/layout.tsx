import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { ADMIN_HOME, PRO_HOME } from "@/lib/auth/routes";
import { conditionGuideHref } from "@/lib/conditions/links";
import { currentPerson } from "@/lib/profile/currentPerson";
import { loadUserPath } from "@/lib/user/path";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { loadInbox } from "@/lib/notifications/inbox";

/**
 * Patient dashboard shell. The account type chosen at onboarding decides the
 * dashboard: health professionals (counsellor role) use /pro instead.
 */
export default async function DashboardLayout({
  children,
  params,
}: LayoutProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const supabase = await createClient();
  const user = await getAuthUser(supabase);

  // One round of queries, all at once. The name and path come from the same
  // cached user lookup the page uses, so nothing is fetched twice.
  const [role, person, path, inbox] = await Promise.all([
    user
      ? supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data }) => data?.role ?? null)
      : null,
    // The signed-in person's own name, never a demo persona.
    currentPerson(supabase),
    loadUserPath(supabase),
    user ? loadInbox(supabase) : [],
  ]);
  // Professionals and admins have their own workspaces, never the patient app.
  if (role === "professional") return redirect({ href: PRO_HOME, locale });
  if (role === "admin") return redirect({ href: ADMIN_HOME, locale });

  const conditionsHref =
    path.path === "exploring" ? (path.focus ? conditionGuideHref(path.focus.conditionId) : "/dashboard") : null;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden lg:flex-row">
      <Sidebar name={person.firstName} initial={person.initial} conditionsHref={conditionsHref} />
      {/* One bell: in the phone top bar (next to the menu button), and at the
          top corner of the page from 1024px. */}
      {user ? (
        <div className="absolute end-17 top-2 z-40 lg:end-6 lg:top-4">
          <NotificationBell userId={user.id} role="patient" initial={inbox} />
        </div>
      ) : null}
      <main className="relative min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
