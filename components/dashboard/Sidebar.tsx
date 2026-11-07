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
  MessageCircle,
  Search,
  MapPin,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
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
  | "messages"
  | "privacy";


type NavItem = {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  link?: string;
  short: NavKey;
};

type GroupKey = "understand" | "family" | "care";

/** The 11 menu links, grouped so the menu reads in short, related sets. */
const groups: { key: GroupKey | null; items: NavItem[] }[] = [
  { key: null, items: [{ label: "Home", icon: Home, link: "/dashboard", short: "home" }] },
  {
    key: "understand",
    items: [
      { label: "My results", icon: BarChart3, link: "/dashboard/results", short: "results" },
      { label: "Conditions A–Z", icon: Search, link: "/dashboard/conditions", short: "conditions" },
      { label: "Inheritance simulator", icon: Layers, link: "/dashboard/simulator", short: "simulator" },
    ],
  },
  {
    key: "family",
    items: [
      { label: "Couple view", icon: Users, link: "/dashboard/couple", short: "couple" },
      { label: "Family map", icon: FamilyIcon, link: "/dashboard/family", short: "family" },
      { label: "Talking to family", icon: MessagesSquare, link: "/dashboard/talk", short: "talk" },
    ],
  },
  {
    key: "care",
    items: [
      { label: "Options", icon: Compass, link: "/dashboard/options", short: "options" },
      { label: "Counsellor & referral", icon: Calendar, link: "/dashboard/counsellor", short: "counsellor" },
      { label: "Messages", icon: MessageCircle, link: "/dashboard/messages", short: "messages" },
      { label: "Care & services", icon: MapPin, link: "/dashboard/services", short: "services" },
      { label: "Privacy & consent", icon: ShieldCheck, link: "/dashboard/privacy", short: "privacy" },
    ],
  },
];

/** Home matches only itself; every other link also matches its sub-pages. */
function isActive(path: string, link: string) {
  return link === "/dashboard" ? path === link : path === link || path.startsWith(`${link}/`);
}

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

/**
 * The side menu. From 1024px wide it sits beside the page as designed; below
 * that it becomes a top bar whose menu button opens the same menu in a
 * drawer (a modal <dialog>, so focus stays inside and Escape closes it).
 */
export default function Sidebar(props: SidebarProps) {
  const t = useTranslations("dashboard.sidebar");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    // Open before rendering, so the menu can measure its links for the pill.
    dialogRef.current?.showModal();
    setOpen(true);
  };
  const close = () => dialogRef.current?.close();

  // A drawer left open while the window widens would cover the real sidebar.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const onChange = () => wide.matches && dialogRef.current?.close();
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 py-2 lg:hidden">
        <Logo size="sm" />
        <button
          type="button"
          onClick={show}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t("openMenu")}
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-ink text-white hover:bg-[#2E2A27]"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
      </header>

      <dialog
        ref={dialogRef}
        aria-label={t("label")}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && close()}
        className="fixed inset-y-0 start-0 end-auto m-0 h-dvh max-h-none w-[min(20rem,88vw)] max-w-none border-0 bg-white p-0 shadow-[0_8px_40px_rgba(20,20,20,0.25)] backdrop:bg-ink/40 lg:hidden"
      >
        <SidebarBody {...props} visible={open} onClose={close} />
      </dialog>

      <aside className="hidden h-screen w-66 shrink-0 border-e border-line bg-white lg:block">
        <SidebarBody {...props} visible />
      </aside>
    </>
  );
}

function SidebarBody({
  name,
  initial,
  conditionsHref = null,
  visible,
  onClose,
}: SidebarProps & { visible: boolean; onClose?: () => void }) {
  const t = useTranslations("dashboard.sidebar");
  const pathname = usePathname();
  // The path without the locale prefix ("/en/dashboard" → "/dashboard").
  const path = pathname.slice(3) || "/";

  const menu = conditionsHref
    ? groups.map((g) => ({
        ...g,
        items: g.items.map((item) =>
          item.short === "results" ? { ...item, short: "myConditions" as const, link: conditionsHref } : item,
        ),
      }))
    : groups;

  // The most specific match wins, so a guide under Conditions A–Z doesn't
  // light up two links at once.
  const activeKey =
    menu
      .flatMap((g) => g.items)
      .filter((item) => item.link && isActive(path, item.link))
      .sort((a, b) => (b.link?.length ?? 0) - (a.link?.length ?? 0))[0]?.short ?? null;

  // One black pill that glides to the active link (the layout stays mounted
  // between pages, so it animates from the previous link).
  const linkRefs = useRef(new Map<NavKey, HTMLAnchorElement>());
  const [pill, setPill] = useState<{ top: number; height: number; ready: boolean } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = activeKey ? linkRefs.current.get(activeKey) : undefined;
      setPill((prev) =>
        el ? { top: el.offsetTop, height: el.offsetHeight, ready: prev !== null } : null,
      );
    };
    if (!visible) return;
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [activeKey, visible]);

  let index = 0;

  return (
    // Scrolls when the screen is short, so Sign out is always reachable.
    <div className="flex h-full flex-col overflow-y-auto bg-sidebar pb-5">
      <div className="flex items-center justify-between gap-2 px-6 pt-6 pb-5">
        <div className={`transition-transform duration-300 hover:scale-105 ${onClose ? "" : "mx-auto"}`}>
          <Logo size="sm" />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:bg-brand-tint-soft"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>

      <nav aria-label={t("label")} className="relative flex flex-col px-3.25">
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-3.25 rounded-xl bg-ink shadow-[0_6px_16px_rgba(20,20,20,0.18)] ${
            pill?.ready ? "transition-[translate,height] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]" : ""
          } ${pill ? "opacity-100" : "opacity-0"}`}
          style={pill ? { top: 0, height: pill.height, translate: `0 ${pill.top}px` } : undefined}
        />

        {menu.map((group) => (
          <div key={group.key ?? "top"} className={group.key ? "mt-4 flex flex-col gap-0.5" : "flex flex-col"}>
            {group.key ? (
              <p
                className="nav-in mb-1 px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
                style={{ "--i": index++ } as CSSProperties}
              >
                {t(`groups.${group.key}`)}
              </p>
            ) : null}
            {group.items.map(({ icon: Icon, link, short }) => {
              const active = short === activeKey;
              return (
                <Link
                  key={short}
                  href={link ?? "#"}
                  ref={(el) => {
                    if (el) linkRefs.current.set(short, el);
                    else linkRefs.current.delete(short);
                  }}
                  aria-current={active ? "page" : undefined}
                  onClick={onClose}
                  style={{ "--i": index++ } as CSSProperties}
                  className={`nav-in group relative flex min-h-10 items-center gap-3 rounded-xl px-4 py-2 text-[14px] leading-none transition-colors duration-300 ${
                    active
                      ? "font-semibold text-white"
                      : "font-medium text-ink/80 hover:bg-brand/8 hover:text-ink"
                  }`}
                >
                  <Icon
                    className={`h-4.75 w-4.75 flex-none transition-transform duration-300 ease-out ${
                      active ? "scale-110" : "group-hover:-rotate-6 group-hover:scale-110"
                    }`}
                    strokeWidth={1.7}
                  />
                  <span className="truncate transition-transform duration-300 ease-out group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
                    {t(`nav.${short}`)}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <Link
          href="/dashboard/assistant"
          onClick={onClose}
          className="group mx-3.25 block rounded-2xl bg-brand/10 p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand/15 hover:shadow-card"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-bold">
            <MessageSquare className="h-3.5 w-3.5 text-brand-text" strokeWidth={1.8} />
            {t("ask.title")}
          </span>
          <span className="mt-1.5 block text-[12px] leading-4 text-muted">{t("ask.description")}</span>
          <span className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-bold text-ink">
            {t("ask.cta")}
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 transition-transform duration-300 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1"
              strokeWidth={2}
            />
          </span>
        </Link>

        {/* The signed-in person, their language, and Sign out (design: under the name). */}
        <div className="flex items-center gap-3 px-4.5">
          <div
            aria-hidden="true"
            className="flex size-10 flex-none items-center justify-center rounded-full bg-brand-tint text-sm font-extrabold text-brand-text-dark ring-0 ring-brand-ring transition-[box-shadow] duration-300 hover:ring-4"
          >
            {initial ?? ""}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold">{name ?? t("account")}</span>
            <LanguageSwitch className="text-xs text-neutral-500" />
          </div>
        </div>

        <SignOutButton className="px-3.25" />
      </div>
    </div>
  );
}
