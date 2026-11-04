import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';

import { Volume1 } from "lucide-react";
import CareJourney from "@/components/dashboard/CareJourney";
import SummaryCards from "@/components/dashboard/SummaryCards";
import AskGeneBridge from "@/components/dashboard/AskGeneBridge";
import ExplorePanel from "@/components/dashboard/ExplorePanel";

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'dashboard') : {};
}

export default async function Page({ params }: PageProps<'/[locale]/dashboard'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
//   return <PlaceholderPage locale={locale} screen="dashboard" />;
  return (
        <main className="min-w-0 min-h-0 overflow-auto flex-1 px-10 pb-10 pt-9">
            <div className="mx-auto">
            <header className="flex items-start justify-between">
                <div>
                <h1 className="text-[32px] text-ink font-extrabold leading-7.5 tracking-[-0.01em]">
                    Good morning, Mariam
                </h1>
                <p className="mt-3.5 text-[15px] leading-3.5 text-neutral-500">
                    Here is where you are. Take it one step at a time.
                </p>
                </div>
                <button className="mt-3.5 flex items-center gap-1.75 rounded-full border border-neutral-200 bg-white px-6.5 py-3 text-[15px] font-bold shadow-card cursor-pointer hover:bg-brand/5">
                <Volume1 className="h-4 w-4" strokeWidth={2.75} />
                    Listen
                </button>
            </header>

            <div className="mt-4.25 flex flex-col gap-4.5">
                <CareJourney />
                <SummaryCards />
                <div className="grid grid-cols-[1.75fr_1fr] gap-5">
                <AskGeneBridge />
                <ExplorePanel />
                </div>
            </div>
            </div>
        </main>
    )
}
