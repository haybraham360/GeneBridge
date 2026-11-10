import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { logEvents } from '@/lib/auth/events';
import { toCsv, type CsvRow } from '@/lib/analytics/csv';
import { showSyntheticLabel } from '@/lib/analytics/demo';
import { equityFlags } from '@/lib/analytics/equity';
import { exportFileName, parseFilters } from '@/lib/analytics/filters';
import { isAnalyst, loadCentres, loadDashboard } from '@/lib/analytics/queries';
import type { DashboardData, Figure, Filters } from '@/lib/analytics/types';
import { createClient } from '@/lib/supabase/server';
import type { ProgrammeEvent } from '@/lib/analytics/events';

/**
 * "Export report": a CSV of the aggregated figures currently shown, for the
 * same filters. Built only from DashboardData (the aggregate function
 * results), so it never holds row-level data. Analysts only; 404 otherwise.
 */
export async function GET(request: Request, { params }: RouteContext<'/[locale]/admin/analytics/export'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAnalyst(supabase))) return notFound();

  let centres: string[];
  let data: DashboardData;
  const search = Object.fromEntries(new URL(request.url).searchParams);
  let filters: Filters;
  try {
    centres = await loadCentres(supabase);
    filters = parseFilters(search, centres);
    data = await loadDashboard(supabase, filters);
  } catch {
    return new Response('The figures could not be loaded. Please try again.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const t = await getTranslations({ locale, namespace: 'analytics' });
  const csv = toCsv(reportRows(data, filters, t, await showSyntheticLabel()));

  // Filters only: never the figures, never anything about a person.
  const event: ProgrammeEvent = {
    name: 'analytics_exported',
    props: { range: filters.range, centre: filters.centre ?? 'all' },
  };
  await logEvents(supabase, user.id, [event]);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(filters.range)}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function notFound() {
  return new Response('Not found', { status: 404 });
}

type T = Awaited<ReturnType<typeof getTranslations<'analytics'>>>;

/** One decimal, as returned by the database; hidden figures as text. */
function value(v: Figure, hidden: string): string | number {
  return v === null ? hidden : Math.round(v * 10) / 10;
}

function reportRows(data: DashboardData, filters: Filters, t: T, synthetic: boolean): CsvRow[] {
  const hidden = t('hidden');
  const v = (x: Figure) => value(x, hidden);
  const c = (key: Parameters<T>[0]) => t(key);
  const prev = (x: Figure) => (data.previous ? v(x) : '');

  const rows: CsvRow[] = [];
  if (synthetic) rows.push([c('csv.notice')]);
  rows.push(
    [c('csv.filters'), c('csv.range'), t(`filters.ranges.${filters.range}`)],
    [c('csv.filters'), c('csv.centre'), filters.centre ?? c('filters.allCentres')],
    [c('csv.filters'), c('csv.generated'), new Date().toISOString().slice(0, 10)],
    [c('csv.notTracked')],
    [],
    [
      c('csv.section'),
      c('csv.measure'),
      c('csv.group'),
      c('csv.thisPeriod'),
      c('csv.previous'),
      c('csv.unit'),
      c('csv.note'),
    ],
  );

  const kpi = c('csv.kpis');
  const { current: now, previous: before } = data;
  rows.push(
    [kpi, c('csv.understandingBefore'), '', v(now.preScore), prev(before?.preScore ?? null), c('csv.unitPercent'), ''],
    [kpi, c('csv.understandingAfter'), '', v(now.postScore), prev(before?.postScore ?? null), c('csv.unitPercent'), ''],
    [kpi, c('kpis.uptake.title'), '', v(now.uptakePct), prev(before?.uptakePct ?? null), c('csv.unitPercent'), c('kpis.uptake.definition')],
    [kpi, c('kpis.referral.title'), '', v(now.medianDays), prev(before?.medianDays ?? null), c('csv.unitDays'), c('kpis.referral.definition')],
    [kpi, c('kpis.onboarding.title'), '', v(now.onboardingPct), prev(before?.onboardingPct ?? null), c('csv.unitPercent'), c('kpis.onboarding.definition')],
  );

  const funnel = c('funnel.title');
  for (const step of data.funnel) {
    rows.push([funnel, t(`funnel.steps.${step.step}`), '', v(step.value), '', c('csv.unitCount'), '']);
  }

  const modes = c('modes.title');
  for (const m of data.modes) {
    const group = t(`modes.items.${m.mode}`);
    rows.push(
      [modes, c('modes.columns.users'), group, v(m.users), '', c('csv.unitCount'), ''],
      [modes, c('modes.columns.gain'), group, v(m.gain), '', c('csv.unitPoints'), ''],
    );
  }

  const equity = c('equity.title');
  for (const row of data.equity) {
    const group = t(`equity.languages.${row.language}`);
    const flag = equityFlags(row, data.overall).any ? c('equity.flag') : '';
    rows.push(
      [equity, c('equity.columns.users'), group, v(row.users), '', c('csv.unitCount'), flag],
      [equity, c('equity.columns.gain'), group, v(row.gain), '', c('csv.unitPoints'), flag],
      [equity, c('equity.columns.uptake'), group, v(row.uptakePct), '', c('csv.unitPercent'), flag],
      [equity, c('equity.columns.days'), group, v(row.medianDays), '', c('csv.unitDays'), flag],
    );
  }

  const distance = c('distance.title');
  for (const row of data.distance) {
    const group = t(`distance.bands.${row.band}`);
    rows.push(
      [distance, c('distance.searches'), group, v(row.searches), '', c('csv.unitCount'), ''],
      [distance, c('distance.people'), group, v(row.people), '', c('csv.unitCount'), ''],
    );
  }

  return rows;
}
