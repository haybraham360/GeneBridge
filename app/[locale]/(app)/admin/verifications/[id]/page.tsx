import { ArrowLeft } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { registryLookup } from '@/lib/kyc/registry';
import { openSubmission, requireAdminPage } from '@/lib/kyc/server';
import { DecisionPanel } from '../components/DecisionPanel';
import { DocumentViewer } from '../components/DocumentViewer';
import { PrecheckChips } from '../components/PrecheckChips';
import { RegistryLink } from '../components/RegistryLink';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/verifications/[id]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'admin.review' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * One submission: documents side by side, typed details, AI pre-check chips
 * and the registry lookup. Opening it is audited (and moves it to in review).
 */
export default async function ReviewPage({ params }: PageProps<'/[locale]/admin/verifications/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase }, t, tl, format] = await Promise.all([
    requireAdminPage(),
    getTranslations({ locale, namespace: 'admin.review' }),
    getTranslations({ locale, namespace: 'proOnboarding.labels' }),
    getFormatter({ locale }),
  ]);
  const s = await openSubmission(supabase, id);
  if (!s) notFound();
  const open = s.status === 'submitted' || s.status === 'in_review';
  const pre = s.ai_precheck;
  const lookup = registryLookup(s.entered_authority);
  const doc = (path: string) => `/api/kyc/document?submission=${encodeURIComponent(s.id)}&path=${encodeURIComponent(path)}`;

  return (
    <>
      <Link href="/admin/verifications" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-brand-text">
        <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        {t('back')}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{s.professional.display_name}</h1>
        <p className="text-[15px] text-muted">
          {s.professional.profession ? tl(`profession.${s.professional.profession}`) : ''} ·{' '}
          {t('submitted', { date: format.dateTime(new Date(s.created_at), { dateStyle: 'medium', timeStyle: 'short' }) })} ·{' '}
          <span data-testid="review-status">{t(`statuses.${s.status}`)}</span>
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {open ? (
            <section aria-labelledby="docs-title" className="flex flex-col gap-3">
              <h2 id="docs-title" className="text-lg font-extrabold">
                {t('documents')}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <DocumentViewer title={t('licence')} urls={s.licence_document_paths.map(doc)} />
                <DocumentViewer title={t('id')} urls={s.id_document_paths.map(doc)} />
                {s.selfie_path ? <DocumentViewer title={t('selfie')} urls={[doc(s.selfie_path)]} mirror /> : null}
              </div>
              {!s.selfie_path ? <p className="text-sm text-muted">{t('noSelfie')}</p> : <p className="text-sm text-muted">{t('selfieNote')}</p>}
            </section>
          ) : (
            <p className={cn(cardClasses, 'p-5 text-[15px]')}>{t('documentsDeleted')}</p>
          )}

          <section aria-labelledby="precheck-title" className={cn(cardClasses, 'flex flex-col gap-3 p-5')}>
            <h2 id="precheck-title" className="text-lg font-extrabold">
              {t('precheck')}
            </h2>
            <p className="text-sm text-muted">{t('precheckNote')}</p>
            {pre?.status === 'completed' ? (
              <>
                <PrecheckChips checks={pre.checks} />
                {pre.read ? (
                  <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-[auto_1fr]">
                    <dt className="font-bold">{t('read.licenceName')}</dt>
                    <dd>{pre.read.licence_name ?? '—'}</dd>
                    <dt className="font-bold">{t('read.idName')}</dt>
                    <dd>{pre.read.id_name ?? '—'}</dd>
                    <dt className="font-bold">{t('read.licenceNumber')}</dt>
                    <dd>
                      <bdi dir="ltr">{pre.read.licence_number ?? '—'}</bdi>
                    </dd>
                    <dt className="font-bold">{t('read.authority')}</dt>
                    <dd>{pre.read.licence_authority ?? '—'}</dd>
                    <dt className="font-bold">{t('read.expiry')}</dt>
                    <dd>
                      <bdi dir="ltr">{pre.read.licence_expiry ?? '—'}</bdi>
                    </dd>
                  </dl>
                ) : null}
                {pre.issues?.length ? (
                  <p className="text-[15px]">
                    <span className="font-bold">{t('issues')}</span> {pre.issues.map((i) => t(`issueNames.${i}` as 'issueNames.blurry')).join(', ')}
                  </p>
                ) : null}
                {pre.provider ? (
                  <p className="text-[15px]">{t('provider', { name: pre.provider.name, id: pre.provider.id_authentic, face: pre.provider.face_match })}</p>
                ) : null}
              </>
            ) : (
              <p className="text-[15px]">{t(`precheckUnavailable.${pre?.status === 'unavailable' ? pre.reason : 'pending'}`)}</p>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="typed-title" className={cn(cardClasses, 'flex flex-col gap-3 p-5')}>
            <h2 id="typed-title" className="text-lg font-extrabold">
              {t('typed')}
            </h2>
            <dl className="grid gap-x-4 gap-y-2 text-[15px] sm:grid-cols-[auto_1fr]">
              <dt className="font-bold">{t('fields.number')}</dt>
              <dd>
                <bdi dir="ltr">{s.entered_licence_number}</bdi>
              </dd>
              <dt className="font-bold">{t('fields.authority')}</dt>
              <dd>{s.entered_authority === 'other' ? s.entered_authority_other : tl(`authority.${s.entered_authority}`)}</dd>
              <dt className="font-bold">{t('fields.expiry')}</dt>
              <dd>
                <bdi dir="ltr">{s.entered_expiry}</bdi>
              </dd>
              <dt className="font-bold">{t('fields.languages')}</dt>
              <dd>{s.professional.languages.map((l) => tl(`language.${l}` as 'language.en')).join(', ')}</dd>
              <dt className="font-bold">{t('fields.facility')}</dt>
              <dd>{s.professional.facility_name ?? '—'}</dd>
            </dl>
            <RegistryLink submissionId={s.id} url={lookup.url} note={lookup.note} />
          </section>

          {open ? (
            <DecisionPanel
              submissionId={s.id}
              initial={{ licenceNumber: s.entered_licence_number, authority: s.entered_authority, expiry: s.entered_expiry }}
            />
          ) : (
            <section className={cn(cardClasses, 'flex flex-col gap-2 p-5 text-[15px]')}>
              <h2 className="text-lg font-extrabold">{t('decided')}</h2>
              <p>{t(`statuses.${s.status}`)}</p>
              {s.reviewer_notes ? <p className="text-muted">{s.reviewer_notes}</p> : null}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
