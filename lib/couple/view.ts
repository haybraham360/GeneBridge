import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { conditionIdForCode } from '@/lib/results/report';

/**
 * The couple view's data (task 10), for the signed-in person only, through
 * the consent-gated database functions: shared conditions once both
 * agreed, and the partner's own findings only if the partner chose to share
 * more than shared results.
 */
export type CoupleState = 'no_partner' | 'consent_missing' | 'result_missing' | 'flagged';
export type SharedCondition = { conditionId: string; myStatus: 'carrier' | 'affected'; partnerStatus: 'carrier' | 'affected' };
export type ConsentStatus = {
  linked: boolean;
  partnerName: string | null;
  meAgreed: boolean;
  meLevel: 'shared_only' | 'summary' | 'full' | null;
  partnerAgreed: boolean;
  agreedAt: string | null;
};

export type CoupleView =
  | { state: CoupleState; consent: ConsentStatus }
  | {
      state: 'ready';
      consent: ConsentStatus;
      partnerName: string | null;
      agreedAt: string | null;
      shared: SharedCondition[];
      partnerFindings: string[];
      /** Uses findings from photographed reports both partners saved (task 12). */
      basedOnUploads: boolean;
    };

const noConsent: ConsentStatus = { linked: false, partnerName: null, meAgreed: false, meLevel: null, partnerAgreed: false, agreedAt: null };

export async function loadConsentStatus(supabase: SupabaseClient): Promise<ConsentStatus> {
  const { data, error } = await supabase.rpc('couple_consent_status');
  const row = (data as { linked: boolean; partner_name: string | null; me_agreed: boolean; me_level: string | null; partner_agreed: boolean; agreed_at: string | null }[] | null)?.[0];
  if (error || !row) return noConsent;
  return {
    linked: row.linked,
    partnerName: row.partner_name?.trim() || null,
    meAgreed: row.me_agreed,
    meLevel: row.me_level === 'summary' || row.me_level === 'full' || row.me_level === 'shared_only' ? row.me_level : null,
    partnerAgreed: row.partner_agreed,
    agreedAt: row.agreed_at,
  };
}

export async function loadCoupleView(supabase: SupabaseClient): Promise<CoupleView> {
  const [consent, { data, error }] = await Promise.all([loadConsentStatus(supabase), supabase.rpc('couple_shared_conditions')]);
  type Row = { available: boolean; reason: string | null; partner_name: string | null; condition_code: string | null; my_status: string | null; partner_status: string | null; agreed_at: string | null; based_on_upload?: boolean };
  const rows = (error ? [] : (data ?? [])) as Row[];
  const first = rows[0];
  if (!first || !first.available) {
    const reason = first?.reason;
    const state: CoupleState =
      reason === 'consent_missing' || reason === 'result_missing' || reason === 'flagged' ? reason : consent.linked ? 'consent_missing' : 'no_partner';
    return { state, consent };
  }
  const shared = rows
    .filter((r) => r.condition_code)
    .map((r) => ({
      conditionId: conditionIdForCode(r.condition_code as string),
      myStatus: r.my_status as SharedCondition['myStatus'],
      partnerStatus: r.partner_status as SharedCondition['partnerStatus'],
    }));
  const { data: partnerRows } = await supabase.rpc('couple_partner_findings');
  const partnerFindings = ((partnerRows ?? []) as { condition_code: string }[]).map((r) => conditionIdForCode(r.condition_code));
  return {
    state: 'ready',
    consent,
    partnerName: first.partner_name?.trim() || null,
    agreedAt: first.agreed_at,
    shared,
    partnerFindings,
    basedOnUploads: rows.some((r) => r.based_on_upload === true),
  };
}
