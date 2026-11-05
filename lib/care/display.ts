/**
 * Titles and short meta lines for the care journey, for the dashboard home
 * and the Counsellor & referral page. Takes the `dashboard` translator.
 */
import type { useFormatter } from 'next-intl';
import { PROGRAMME_TIME_ZONE } from '@/lib/pro/queue';
import { careSteps, currentStepNumber, type CareFacts, type StepKey, type StepStatus } from './tracker';

type Translate = (key: string, values?: Record<string, string | number>) => string;
type Formatter = Pick<ReturnType<typeof useFormatter>, 'dateTime'>;

export type CareStepView = { key: StepKey; title: string; meta: string; status: StepStatus };

export function careView(facts: CareFacts, t: Translate, format: Formatter) {
  const day = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'short', timeZone: PROGRAMME_TIME_ZONE });
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: PROGRAMME_TIME_ZONE,
    });
  const referralMeta = (r: CareFacts['test'], fallback: string) => {
    if (!r) return fallback;
    if (r.status === 'ordered') return t('careMeta.ordered', { date: day(r.updatedAt) });
    if (r.status === 'done') return t('careMeta.done', { date: day(r.updatedAt) });
    return t(`careMeta.${r.status}`);
  };

  const meta: Record<StepKey, string> = {
    screening: facts.result?.reportedAt ? day(facts.result.reportedAt) : t('careMeta.notYet'),
    understood: facts.result ? t('careJourney.steps.understood.meta') : t('careMeta.notYet'),
    booked: facts.booking ? when(facts.booking.startsAt) : t('careMeta.notYet'),
    session: facts.booking?.attendedAt
      ? t('careMeta.attended', { date: day(facts.booking.attendedAt) })
      : t('careJourney.steps.session.meta'),
    test: referralMeta(facts.test, t('careJourney.steps.test.meta')),
    specialist: facts.specialist
      ? [facts.specialist.serviceName, referralMeta(facts.specialist, '')].filter(Boolean).join(' · ')
      : t('careJourney.steps.specialist.meta'),
  };

  const steps = careSteps(facts).map((s) => ({
    key: s.key,
    status: s.status,
    title: t(`careJourney.steps.${s.key}.title`),
    meta: meta[s.key],
  }));
  return { steps, current: currentStepNumber(careSteps(facts)) };
}
