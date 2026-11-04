import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rangeDays } from './filters';
import {
  equityLanguages,
  funnelSteps,
  learningModes,
  type DashboardData,
  type EquityLanguage,
  type Figure,
  type Filters,
  type FunnelStepKey,
  type KpiSet,
  type LearningModeKey,
} from './types';

/**
 * Reads for the programme dashboard. Every figure comes from the aggregate
 * database functions (supabase/migrations/20261104020000_analytics.sql),
 * called as the signed-in analyst. Nothing here touches a raw table.
 */

/** Is the signed-in user an analyst? False for anyone else, and on any error. */
export async function isAnalyst(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('analytics_is_analyst');
  return !error && data === true;
}

/** Centres with at least 10 people, for the centre filter. */
export async function loadCentres(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc('analytics_centres');
  if (error) throw new Error('analytics_centres failed');
  return ((data ?? []) as { centre: string }[]).map((r) => r.centre);
}

function figure(value: unknown): Figure {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type KpiRow = {
  period: 'current' | 'previous';
  pre_score: unknown;
  post_score: unknown;
  uptake_pct: unknown;
  median_days: unknown;
  onboarding_pct: unknown;
};

function kpiSet(row: KpiRow | undefined): KpiSet {
  return {
    preScore: figure(row?.pre_score),
    postScore: figure(row?.post_score),
    uptakePct: figure(row?.uptake_pct),
    medianDays: figure(row?.median_days),
    onboardingPct: figure(row?.onboarding_pct),
  };
}

export async function loadDashboard(
  supabase: SupabaseClient,
  filters: Filters,
): Promise<DashboardData> {
  const args = { p_days: rangeDays(filters.range), p_centre: filters.centre };

  const [kpis, funnel, modes, equity] = await Promise.all([
    supabase.rpc('analytics_kpis', args),
    supabase.rpc('analytics_funnel', args),
    supabase.rpc('analytics_learning_modes', args),
    supabase.rpc('analytics_equity', args),
  ]);
  // Function names only: error details could echo arguments.
  for (const [name, result] of Object.entries({ kpis, funnel, modes, equity })) {
    if (result.error) throw new Error(`analytics ${name} failed`);
  }

  const kpiRows = (kpis.data ?? []) as KpiRow[];
  const funnelRows = (funnel.data ?? []) as { step: string; value: unknown }[];
  const modeRows = (modes.data ?? []) as { mode: string; users: unknown; gain: unknown }[];
  const equityRows = (equity.data ?? []) as {
    language: string;
    users: unknown;
    gain: unknown;
    uptake_pct: unknown;
    median_days: unknown;
  }[];

  const all = equityRows.find((r) => r.language === 'all');

  return {
    current: kpiSet(kpiRows.find((r) => r.period === 'current')),
    previous:
      filters.range === 'all' ? null : kpiSet(kpiRows.find((r) => r.period === 'previous')),
    // Always the fixed list, in order, whatever the database returns.
    funnel: funnelSteps.map((step: FunnelStepKey) => ({
      step,
      value: figure(funnelRows.find((r) => r.step === step)?.value),
    })),
    modes: learningModes.map((mode: LearningModeKey) => {
      const row = modeRows.find((r) => r.mode === mode);
      return { mode, users: figure(row?.users), gain: figure(row?.gain) };
    }),
    equity: equityLanguages.map((language: EquityLanguage) => {
      const row = equityRows.find((r) => r.language === language);
      return {
        language,
        users: figure(row?.users),
        gain: figure(row?.gain),
        uptakePct: figure(row?.uptake_pct),
        medianDays: figure(row?.median_days),
      };
    }),
    overall: { gain: figure(all?.gain), uptakePct: figure(all?.uptake_pct) },
  };
}

/** True when every figure is hidden or missing: show the empty state. */
export function isEmpty(data: DashboardData): boolean {
  return data.funnel.every((s) => s.value === null);
}
