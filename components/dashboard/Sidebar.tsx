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
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { useState, useEffect } from "react";
import { Logo } from "../ui/Logo";
import { LanguageSwitch } from "../marketing/LanguageSwitch";
import { useTranslations } from "next-intl";

type NavKey =
  | "home"
  | "results"
  | "couple"
  | "simulator"
  | "family"
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
  { label: "Couple view", icon: Users, link: "/dashboard/couple", short: "couple" },
  { label: "Inheritance simulator", icon: Layers, link: "/dashboard/simulator", short: "simulator"  },
  { label: "Family map", icon: FamilyIcon, link: "/dashboard/family", short: "family"  },
  { label: "Options", icon: Compass, link: "/dashboard/options", short: "options"  },
  { label: "Counsellor & referral", icon: Calendar, link: "/dashboard/counsellor", short: "counsellor"  },
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

export default function Sidebar() {

  const [activeLink, setActiveLink] = useState("Home");
  const pathname = usePathname();
  const spreadChars = pathname.slice(3); 
  const t = useTranslations('dashboard.sidebar'); 

  useEffect(() => {
    const activeItem = nav.find((item) => item.link === pathname);
    if (activeItem) {
      setActiveLink(activeItem.label);
    }
  }, [usePathname()]);

  return (
    <aside className="flex h-screen pb-8 bg-white w-66 border-r border-slate-200 shrink-0 flex-col bg-sidebar">
      <div className="px-6 pb-6 pt-8 flex items-center justify-center scale-110">
        <Logo size="sm" />
      </div>

      <nav className="flex flex-col gap-1.5 px-3.25">
        {nav.map(({ label, icon: Icon, link, short }) => (
          <a
            key={label}
            href={link || "#"}
            aria-current={spreadChars === link ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-medium leading-none ${
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

      <div className="mt-auto">
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
          <button className="mt-2.75 text-[10px] font-medium text-ink cursor-pointer hover:bg-brand/15 p-3 rounded-2xl">
            {/* Ask a question */}
            {t("ask.cta")}
          </button>
        </div>

        <div className="flex items-center gap-2.5 px-4.5 pb-0 pt-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-[10px] font-medium text-[#9A3412]">
            M
          </div>
          <div className="leading-tight mt-3">
            <div className="text-[10px] font-medium">Mariam</div>
            <div className="-mt-4 text-[8.5px] text-neutral-500">
              {/* English · <span dir="rtl">العربية</span> */}
              <LanguageSwitch />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
