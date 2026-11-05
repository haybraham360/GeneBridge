"use client";

import {
  Home,
  BarChart3,
  Users,
  Layers,
  Compass,
  Calendar,
  ShieldCheck,
  MessageSquare,
  MessagesSquare,
  Search,
  MapPin,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Logo } from "../ui/Logo";
import { LanguageSwitch } from "../marketing/LanguageSwitch";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";

type NavKey =
  | "home"
  | "results"
  | "myConditions"
  | "couple"
  | "simulator"
  | "family"
  | "talk"
  | "conditions"
  | "services"
  | "options"
  | "counsellor"
  | "privacy";


type NavItem = {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  link?: string;
  short: NavKey;
};

const nav: NavItem[] = [
  { label: "Home", icon: Home, link: "/dashboard", short: "home" },
  { label: "My results", icon: BarChart3, link: "/dashboard/results", short: "results" },
  { label: "Conditions A–Z", icon: Search, link: "/dashboard/conditions", short: "conditions" },
  { label: "Couple view", icon: Users, link: "/dashboard/couple", short: "couple" },
  { label: "Inheritance simulator", icon: Layers, link: "/dashboard/simulator", short: "simulator"  },
  { label: "Family map", icon: FamilyIcon, link: "/dashboard/family", short: "family"  },
  { label: "Talking to family", icon: MessagesSquare, link: "/dashboard/talk", short: "talk" },
  { label: "Options", icon: Compass, link: "/dashboard/options", short: "options"  },
  { label: "Counsellor & referral", icon: Calendar, link: "/dashboard/counsellor", short: "counsellor"  },
  { label: "Care & services", icon: MapPin, link: "/dashboard/services", short: "services" },
  { label: "Privacy & consent", icon: ShieldCheck, link: "/dashboard/privacy", short: "privacy"  },
];

function FamilyIcon({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="3" width="6" height="5" rx="1.2" />
      <rect x="3" y="16" width="6" height="5" rx="1.2" />
      <rect x="15" y="16" width="6" height="5" rx="1.2" />
      <path d="M12 8v4M6 16v-4h12v4" />
    </svg>
  );
}

type SidebarProps = {
  /** The signed-in person's first name, or null if they haven't given one. */
  name: string | null;
  initial: string | null;
  /**
   * Exploring path (task 11): "My results" becomes "My conditions", linking
   * to the focused condition's guide. Null on the result path.
   */
  conditionsHref?: string | null;
};

export default function Sidebar({ name, initial, conditionsHref = null }: SidebarProps) {
  const items: NavItem[] = conditionsHref
    ? nav.map((item) => (item.short === "results" ? { ...item, short: "myConditions", link: conditionsHref } : item))
    : nav;

  const pathname = usePathname();
  // The path without the locale prefix ("/en/dashboard" → "/dashboard").
  const spreadChars = pathname.slice(3);
  const t = useTranslations('dashboard.sidebar');

  return (
    // Scrolls when the screen is short, so Sign out is always reachable.
    <aside className="flex h-screen w-66 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white bg-sidebar pb-5">
      <div className="flex items-center justify-center px-6 pt-6 pb-4 scale-110">
        <Logo size="sm" />
      </div>

      <nav className="flex flex-col gap-1 px-3.25">
        {items.map(({ label, icon: Icon, link, short }) => (
          <a
            key={label}
            href={link || "#"}
            aria-current={spreadChars === link ? "page" : undefined}
            className={`flex min-h-10 items-center gap-3 rounded-xl px-4 py-2 text-[14px] font-medium leading-none ${
              spreadChars === link
                ? " bg-black text-white"
                : "text-ink/85 hover:bg-brand/5"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.6} />
            {/* {label} */}
            {t(`nav.${short}`)}
          </a>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <div className="mx-3.25 rounded-2xl bg-brand/10 p-2.75 pb-3.25">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            <MessageSquare
              className="h-3 w-3 text-[#9A3412]"
              strokeWidth={1.8}
            />
            {/* Ask GeneBridge */}
            {t("ask.title")}
          </div>
          <p className="mt-1.5 text-[10px] leading-3.5 text-neutral-600">
            {/* General questions about genetics. It won&apos;t interpret your
            personal result. */}
            {t("ask.description")}
          </p>
          <Link
            href="/dashboard/assistant"
            className="mt-2.75 inline-block text-[10px] font-medium text-ink cursor-pointer hover:bg-brand/15 p-3 rounded-2xl"
          >
            {t("ask.cta")}
          </Link>
        </div>

        {/* The signed-in person, their language, and Sign out (design: under the name). */}
        <div className="flex items-center gap-3 px-4.5">
          <div aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-full bg-[#FFE3D3] text-sm font-extrabold text-[#9A3412]">
            {initial ?? ""}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold">{name ?? t("account")}</span>
            <LanguageSwitch className="text-xs text-neutral-500" />
          </div>
        </div>

        <SignOutButton className="px-3.25" />
      </div>
    </aside>
  );
}
