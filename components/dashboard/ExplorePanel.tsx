import { Layers, Compass } from "lucide-react";

function FamilyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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

const items = [
  { label: "Inheritance simulator", icon: Layers, href: "/dashboard/simulator" },
  { label: "Build your family map", icon: FamilyIcon, href: "/dashboard/family" },
  { label: "Explore your options", icon: Compass, href: "/dashboard/options" },
];

export default function ExplorePanel() {
  return (
    <section className="rounded-2xl bg-white px-4 pt-4.5 shadow-card">
      <h2 className="text-[20px] font-extrabold leading-none">
        Explore at your own pace
      </h2>
      <ul className="mt-2.75 flex flex-col gap-2.25">
        {items.map(({ label, icon: Icon, href }) => (
          <li key={label}>
            <a
              href={href}
              className="flex items-center gap-3.25 rounded-[10px] bg-brand/5 p-3.25 text-[15px] font-medium text-ink"
            >
              <Icon className="h-6 w-6 text-[#C2410C]" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
