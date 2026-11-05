import { Calendar, Check, Compass, Info, Layers, ShieldCheck, Users } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { conditionEntry } from '@/lib/conditions/catalogue';
import { simulatorHref } from '@/lib/conditions/links';
import type { CoupleView } from '@/lib/couple/view';
import { calculateInheritance, type Chances } from '@/lib/genetics/inheritance';

type Ready = Extract<CoupleView, { state: 'ready' }>;

/**
 * The couple view once both partners agreed (task 10, design Couple). Only
 * conditions BOTH carry appear; every chance comes from the inheritance
 * engine. Other results stay private, even from each other.
 */
export async function SharedCouple({ view, locale, myName }: { view: Ready; locale: 'en' | 'ar'; myName: string | null }) {
  const t = await getTranslations({ locale, namespace: 'couple' });
  const tc = await getTranslations({ locale, namespace: 'conditions' });
  const format = await getFormatter({ locale });
  const me = myName ?? t('you');
  const partner = view.partnerName ?? t('yourPartner');
  const bold = (chunks: React.ReactNode) => <strong className="font-extrabold">{chunks}</strong>;
  const level = (l: string | null) => t(`levels.${(l ?? 'shared_only') as 'shared_only' | 'summary' | 'full'}`);

  const shared = view.shared.flatMap((s) => {
    const entry = conditionEntry(s.conditionId, locale);
    if (!entry) return [];
    // Numbers only for recessive conditions between two results; anything
    // else is explained by a counsellor.
    const chances: Chances | null =
      entry.inheritance === 'autosomal_recessive' ? calculateInheritance('autosomal_recessive', s.myStatus, s.partnerStatus).chances : null;
    return [{ s, entry, chances }];
  });

  const partnerFindingNames = view.partnerFindings
    .filter((id) => !view.shared.some((s) => s.conditionId === id))
    .map((id) => conditionEntry(id, locale)?.title ?? id);

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
          <p className="text-[15px] text-muted">
            {view.agreedAt
              ? t('subtitle', { me, partner, date: format.dateTime(new Date(view.agreedAt), { day: 'numeric', month: 'short', year: 'numeric' }) })
              : t('subtitleNoDate', { me, partner })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/couple/consent" className={buttonClasses('ghost', 'md')}>
            <Users aria-hidden="true" className="size-5" strokeWidth={2} />
            {t('consentSettings')}
          </Link>
          <Link href="/dashboard/privacy" className={buttonClasses('ghost', 'md')}>
            <ShieldCheck aria-hidden="true" className="size-5" strokeWidth={2} />
            {t('manageSharing')}
          </Link>
        </div>
      </header>

      <ul className="mt-5 flex flex-wrap gap-2.5 text-sm font-semibold">
        {[
          { name: me, l: view.consent.meLevel },
          { name: partner, l: null },
        ].map((c) => (
          <li key={c.name} className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2">
            <Check aria-hidden="true" className="size-4 text-unaffected" strokeWidth={2.5} />
            {t('agreedChip', { name: c.name, level: level(c.l) })}
          </li>
        ))}
      </ul>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-5">
          {shared.length === 0 ? (
            <section data-testid="couple-none-shared" className={cn(cardClasses, 'flex flex-col gap-2 p-6')}>
              <h2 className="text-xl font-extrabold">{t('noneShared')}</h2>
              <p className="text-[15px] leading-[1.6] text-muted">{t('noneSharedBody')}</p>
            </section>
          ) : null}
          {shared.map(({ entry, chances }) => {
            const label = entry.disease_label ?? entry.title;
            return (
              <section key={entry.id} data-testid="shared-condition" className={cn(cardClasses, 'flex flex-col gap-5 p-[clamp(24px,4vw,36px)]')}>
                <ul className="flex flex-wrap gap-2 text-sm font-semibold">
                  <li className="rounded-full bg-brand-tint px-3 py-1 text-brand-text-dark">{t('sharedCount', { count: shared.length })}</li>
                  <li className="rounded-full border border-line px-3 py-1">{tc(`patterns.${entry.inheritance ?? 'complex'}`)}</li>
                </ul>
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-[22px] leading-tight font-extrabold">{t('chancesTitle', { condition: entry.title })}</h2>
                  <p className="text-[15px] text-muted">{entry.gene && !entry.gene.includes(',') ? t('bothCarry', { gene: entry.gene }) : t('bothCarryNoGene')}</p>
                </div>
                {chances ? (
                  <>
                    <ChildrenRow chances={chances} label={label} t={t} />
                    <dl className="grid grid-cols-3 gap-3 text-center">
                      {(
                        [
                          ['affected', 'text-affected', t('statAffected', { label })],
                          ['carrier', 'text-brand-text', t('statCarrier')],
                          ['unaffected', 'text-unaffected', t('statUnaffected')],
                        ] as const
                      ).map(([key, colour, text]) => (
                        <div key={key} className="flex flex-col-reverse gap-1">
                          <dt className="text-sm text-muted">{text}</dt>
                          <dd dir="ltr" className={cn('text-[40px] leading-none font-extrabold', colour)}>
                            {format.number(chances[key] / 100, { style: 'percent' })}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="flex items-start gap-3 rounded-tile border border-line px-5 py-4 text-[15px] leading-[1.6]">
                      <Info aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
                      <span>{t.rich('same', { b: bold })}</span>
                    </p>
                  </>
                ) : (
                  <p className="flex items-start gap-3 rounded-tile bg-brand-tint-soft px-5 py-4 text-[15px] leading-[1.6]">
                    <Info aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
                    {t('counsellorOnly')}
                  </p>
                )}
              </section>
            );
          })}

          <section className={cn(cardClasses, 'flex flex-col gap-2 p-6')}>
            <h2 className="text-xl font-extrabold">{t('elseTitle')}</h2>
            <p className="text-[15px] leading-[1.6]">{t.rich('elseBody', { b: bold })}</p>
            {partnerFindingNames.length ? (
              <p className="text-[15px] leading-[1.6] text-muted">
                {t('partnerShared', { partner, list: format.list(partnerFindingNames, { type: 'conjunction' }) })}
              </p>
            ) : null}
            <p className="text-sm leading-[1.6] text-muted">{t('background')}</p>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {(
            [
              ['simulator', Layers, shared[0] ? simulatorHref(shared[0].entry.id) : '/dashboard/simulator'],
              ['options', Compass, '/dashboard/options'],
              ['counsellor', Calendar, '/dashboard/counsellor?topic=family'],
            ] as const
          ).map(([key, Icon, href]) => (
            <Link key={key} href={href} className={cn(cardClasses, 'flex flex-col gap-2 p-6 hover:bg-brand-tint-soft')}>
              <Icon aria-hidden="true" className="size-6 text-brand-text" strokeWidth={2} />
              <span className="text-lg font-extrabold">{t(`links.${key}.title`)}</span>
              <span className="text-[15px] text-muted">{t(`links.${key}.body`)}</span>
            </Link>
          ))}
        </aside>
      </div>
      <p className="mt-6 text-[15px] text-muted">{t('footer')}</p>
    </main>
  );
}

/** Four example children for one pregnancy's chances. Colour always paired with text. */
function ChildrenRow({ chances, label, t }: { chances: Chances; label: string; t: Awaited<ReturnType<typeof getTranslations<'couple'>>> }) {
  const counts = { affected: Math.round(chances.affected / 25), carrier: Math.round(chances.carrier / 25), unaffected: Math.round(chances.unaffected / 25) };
  const kids = [
    ...Array<'affected'>(counts.affected).fill('affected'),
    ...Array<'carrier'>(counts.carrier).fill('carrier'),
    ...Array<'unaffected'>(counts.unaffected).fill('unaffected'),
  ].slice(0, 4);
  const style = {
    affected: 'bg-affected border-affected',
    carrier: 'bg-brand border-brand-text',
    unaffected: 'bg-surface border-ink',
  } as const;
  const text = { affected: t('childAffected', { label }), carrier: t('childCarrier'), unaffected: t('childUnaffected') };
  return (
    <ul
      aria-label={t('children', { affected: counts.affected, carrier: counts.carrier, unaffected: counts.unaffected, condition: label })}
      className="grid grid-cols-4 gap-3 rounded-tile bg-bg p-5"
    >
      {kids.map((k, i) => (
        <li key={i} className="flex flex-col items-center gap-2 text-center text-sm font-bold">
          <span aria-hidden="true" className="flex flex-col items-center">
            <span className={cn('size-8 rounded-full border-2', style[k])} />
            <span className={cn('mt-1 h-9 w-12 rounded-t-full border-2 border-b-0', style[k])} />
          </span>
          {text[k]}
        </li>
      ))}
    </ul>
  );
}
