import { Lock, ShieldCheck, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { routing } from '@/i18n/routing';
import { FINISHED_ONBOARDING_STEP } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/server';
import { AcceptInviteForm } from './AcceptInviteForm';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/invite/[token]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'onboarding.invitePage' });
  // Invite links are private: keep them out of search results and referrers.
  return { title: t('metaTitle'), robots: { index: false }, referrer: 'no-referrer' };
}

const points = [
  { key: 'private', icon: Lock },
  { key: 'nothingShared', icon: ShieldCheck },
  { key: 'bothAgree', icon: Users },
] as const;

/**
 * Partner invite (task 04, section 4). Signed-out visitors are sent to
 * /auth?next=/invite/<token> by the proxy and come back here after signing in.
 */
export default async function InvitePage({ params }: PageProps<'/[locale]/invite/[token]'>) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'onboarding.invitePage' });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('onboarding_step').eq('user_id', user.id).maybeSingle()
    : { data: null };
  const finished = (profile?.onboarding_step ?? 0) >= FINISHED_ONBOARDING_STEP;

  return (
    <div className="flex min-h-screen flex-col gap-6 px-[clamp(16px,4vw,48px)] pt-6 pb-12">
      <header>
        <Logo size="sm" />
      </header>
      <main id="main" className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
        <Card className="flex flex-col gap-5 p-[clamp(24px,4vw,40px)] motion-safe:animate-fade-up">
          <div className="flex flex-col gap-2">
            <h1 className="text-[clamp(26px,4vw,30px)] leading-tight font-extrabold tracking-[-0.02em]">
              {t('title')}
            </h1>
            <p className="text-base leading-[1.55] text-muted">{t('body')}</p>
          </div>
          <ul className="flex flex-col gap-3 rounded-tile bg-bg p-[18px] text-[15px]">
            {points.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-start gap-3">
                <Icon aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
                <span>{t(`points.${key}`)}</span>
              </li>
            ))}
          </ul>
          <AcceptInviteForm token={token} laterHref={finished ? '/dashboard' : '/onboarding'} />
        </Card>
      </main>
    </div>
  );
}
