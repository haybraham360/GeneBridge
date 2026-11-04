import { ArrowRight } from "lucide-react";

type Card = {
  pill: string;
  pillClass: string;
  title: string;
  body: string;
  link: string;
  href?: string;
};

const cards: Card[] = [
  {
    pill: "Your result",
    pillClass: "bg-[#FFEDE2] text-[#9A3412]",
    title: "Carrier of sickle cell trait (HbAS)",
    body: "You are healthy. See what this means for you.",
    link: "Open explainer",
    href: "/dashboard/results",
  },
  {
    pill: "Couple view unlocked",
    pillClass: "bg-[#E7F6EC] text-[#166534]",
    title: "Khalid joined on 30 Oct",
    body: "You both agreed to share result summaries.",
    link: "See your shared chances",
    href: "/dashboard/couple",
  },
  {
    pill: "Next appointment",
    pillClass: "bg-[#E5ECF6] text-[#1E3A8A]",
    title: "Dr. Amaka Okoro",
    body: "Thu 12 Nov, 10:00 · Video call · Arabic or English",
    link: "Manage booking",
    href: "/dashboard/counsellor",
  },
];

export default function SummaryCards() {
  return (
    <section className="grid grid-cols-3 gap-5">
      {cards.map((c) => (
        <article
          key={c.pill}
          className="flex flex-col rounded-2xl bg-white pl-6 pr-8 py-6 shadow-card"
        >
          <span
            className={`w-fit rounded-full px-3 py-1 text-[12px] font-bold leading-none ${c.pillClass}`}
          >
            {c.pill}
          </span>
          <h3 className="mt-2.5 text-[22px] font-bold leading-6">
            {c.title}
          </h3>
          <p className="my-3 text-[15px] leading-5 text-neutral-500">
            {c.body}
          </p>
          <a
            href={c.href}
            className="mt-auto flex items-center gap-1.25 text-[15px] font-extrabold text-[#C2410C]"
          >
            {c.link}
            <ArrowRight className="h-3 w-3" strokeWidth={1.8} />
          </a>
        </article>
      ))}
    </section>
  );
}
