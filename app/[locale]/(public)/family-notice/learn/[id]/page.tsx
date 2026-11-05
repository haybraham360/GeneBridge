import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NoticeColumn, QuestionsCard, TestingButton } from '@/components/notice/NoticeParts';
import { cardClasses } from '@/components/ui/Card';
import { routing } from '@/i18n/routing';
import { getEntry } from '@/lib/assistant/library';
import { cn } from '@/lib/cn';
import { isNoticeCondition } from '@/lib/notices/types';

// Rendered per request so Next's scripts carry this response's CSP nonce.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/family-notice/learn/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale) || !isNoticeCondition(id)) return {};
  const entry = getEntry(id, locale);
  return entry ? { title: `${entry.title} · GeneBridge` } : {};
}

/**
 * "What is sickle cell?": a public page from the reviewed content library
 * (content/library). General information only; nothing personal.
 */
export default async function LearnPage({ params }: PageProps<'/[locale]/family-notice/learn/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale) || !isNoticeCondition(id)) notFound();
  setRequestLocale(locale);
  const entry = getEntry(id, locale);
  if (!entry) notFound();
  const t = await getTranslations({ locale, namespace: 'notice.learn' });

  const sections = [
    { title: t('whatItIs'), body: entry.summary },
    { title: t('carrier'), body: entry.carrier_meaning },
    { title: t('inheritance'), body: entry.inheritance_plain },
    { title: t('disease'), body: entry.disease_meaning },
    { title: t('screening'), body: entry.screening },
  ].filter((s): s is { title: string; body: string } => Boolean(s.body));

  return (
    <NoticeColumn>
      <article
        aria-labelledby="learn-title"
        className={cn(cardClasses, 'flex flex-col gap-6 rounded-[28px] p-[clamp(24px,5vw,56px)] shadow-none motion-safe:animate-fade-up')}
      >
        <h1 id="learn-title" className="text-[clamp(28px,4vw,40px)] leading-[1.15] font-extrabold tracking-[-0.02em]">
          {entry.title}
        </h1>
        {sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h2 className="text-xl font-extrabold tracking-[-0.01em]">{section.title}</h2>
            <p className="max-w-[720px] text-[17px] leading-[1.6]">{section.body}</p>
          </section>
        ))}
        <div>
          <TestingButton />
        </div>
        <section className="flex flex-col gap-2 border-t border-line pt-5 text-base text-muted md:text-sm">
          <h2 className="font-bold text-ink">{t('sources')}</h2>
          <ul className="flex flex-col gap-1">
            {entry.sources.map((source) => (
              <li key={source.url}>
                {/* Plain text, not links: the page makes no third-party requests and sends no referrer. */}
                {source.title} · {source.publisher}
              </li>
            ))}
          </ul>
          {!entry.reviewed ? <p>{t('draft')}</p> : null}
        </section>
      </article>
      <QuestionsCard />
    </NoticeColumn>
  );
}
