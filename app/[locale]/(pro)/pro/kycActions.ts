'use server';

/*
 * The professional's own settings (task 14, section 4). Every action runs as
 * the signed-in professional (RLS: own rows only). Verification fields and
 * accepting_patients are never written here directly: the toggle goes
 * through pro_set_accepting(), which requires a verified professional.
 */
import { revalidatePath } from 'next/cache';
import { logEvents } from '@/lib/auth/events';
import { detailsColumns, parseDetails, type DetailsField, type DetailsInput } from '@/lib/kyc/details';
import type { KycEvent } from '@/lib/kyc/events';
import { requireProfessionalAction } from '@/lib/kyc/server';

export async function dismissWelcome(): Promise<void> {
  const { supabase, userId } = await requireProfessionalAction();
  await supabase.from('professional_profiles').update({ welcome_seen_at: new Date().toISOString() }).eq('user_id', userId);
}

export async function setAccepting(accepting: boolean): Promise<{ ok: boolean; accepting: boolean }> {
  const { supabase, userId, verified } = await requireProfessionalAction();
  if (!verified) return { ok: false, accepting: false };
  const { data, error } = await supabase.rpc('pro_set_accepting', { p_accepting: accepting === true });
  if (error) return { ok: false, accepting: !accepting };
  await logEvents(supabase, userId, [{ name: 'pro_accepting_toggled', props: { accepting: data === true } }] satisfies KycEvent[]);
  revalidatePath('/[locale]/pro', 'layout');
  return { ok: true, accepting: data === true };
}

export type SaveResult = { status: 'ok' } | { status: 'invalid'; errors: DetailsField[] } | { status: 'error' };

export async function saveProfile(input: DetailsInput & { photoPath?: string | null }): Promise<SaveResult> {
  const { supabase, userId } = await requireProfessionalAction();
  const parsed = parseDetails(input);
  if (!parsed.ok) return { status: 'invalid', errors: parsed.errors };
  const update: Record<string, unknown> = detailsColumns(parsed.value);
  // A photo path is accepted only inside the professional's own folder.
  if (input.photoPath === null) update.photo_path = null;
  else if (typeof input.photoPath === 'string' && input.photoPath === `${userId}/photo.jpg`) update.photo_path = input.photoPath;
  const { error } = await supabase.from('professional_profiles').update(update).eq('user_id', userId);
  if (error) return { status: 'error' };
  await supabase.from('profiles').update({ display_name: parsed.value.displayName }).eq('user_id', userId);
  revalidatePath('/[locale]/pro', 'layout');
  return { status: 'ok' };
}

export type Slot = { weekday: number; startsAt: string; endsAt: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Replaces the weekly hours. Saved now, shown to patients only once verified (task 15). */
export async function saveAvailability(slots: Slot[]): Promise<{ status: 'ok' } | { status: 'invalid' } | { status: 'error' }> {
  const { supabase, userId } = await requireProfessionalAction();
  if (!Array.isArray(slots) || slots.length > 28) return { status: 'invalid' };
  const clean: Slot[] = [];
  for (const s of slots) {
    if (!Number.isInteger(s?.weekday) || s.weekday < 0 || s.weekday > 6) return { status: 'invalid' };
    if (!TIME.test(s.startsAt) || !TIME.test(s.endsAt) || s.endsAt <= s.startsAt) return { status: 'invalid' };
    clean.push({ weekday: s.weekday, startsAt: s.startsAt, endsAt: s.endsAt });
  }
  const { error: deleteError } = await supabase.from('professional_availability').delete().eq('user_id', userId);
  if (deleteError) return { status: 'error' };
  if (clean.length) {
    const { error } = await supabase
      .from('professional_availability')
      .insert(clean.map((s) => ({ user_id: userId, weekday: s.weekday, starts_at: s.startsAt, ends_at: s.endsAt })));
    if (error) return { status: 'error' };
  }
  return { status: 'ok' };
}

export async function saveSettings(input: { language: string; notifyEmail: boolean }): Promise<{ ok: boolean; uiLocale?: 'ar' | 'en' }> {
  const { supabase, userId } = await requireProfessionalAction();
  const language = input.language === 'en' ? 'en' : input.language === 'ar' ? 'ar' : null;
  if (!language) return { ok: false };
  const [a, b] = await Promise.all([
    supabase.from('profiles').update({ locale: language }).eq('user_id', userId),
    supabase.from('professional_profiles').update({ notify_email: input.notifyEmail === true }).eq('user_id', userId),
  ]);
  return a.error || b.error ? { ok: false } : { ok: true, uiLocale: language };
}

export async function markNotificationsRead(): Promise<void> {
  const { supabase, userId } = await requireProfessionalAction();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
}
