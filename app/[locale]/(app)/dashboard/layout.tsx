import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { COUNSELLOR_HOME } from "@/lib/auth/routes";
import { conditionGuideHref } from "@/lib/conditions/links";
import { currentPerson } from "@/lib/profile/currentPerson";
import { loadUserPath } from "@/lib/user/path";
import { createClient } from "@/lib/supabase/server";

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
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile?.role === "counsellor") return redirect({ href: COUNSELLOR_HOME, locale });
  }

  // The signed-in person's own name, never a demo persona.
  const [person, path] = await Promise.all([currentPerson(supabase), loadUserPath(supabase)]);
  const conditionsHref =
    path.path === "exploring" ? (path.focus ? conditionGuideHref(path.focus.conditionId) : "/dashboard") : null;

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <Sidebar name={person.firstName} initial={person.initial} conditionsHref={conditionsHref} />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
