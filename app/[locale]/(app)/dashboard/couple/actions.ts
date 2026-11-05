'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** Agree (or change the level). Nothing is shared until both partners agree. */
export async function agreeCoupleView(level: string): Promise<{ status: 'agreed' | 'no_partner' | 'error' }> {
  if (level !== 'shared_only' && level !== 'summary' && level !== 'full') return { status: 'error' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_couple_consent', { p_level: level });
  if (error) return { status: 'error' };
  revalidatePath('/[locale]/dashboard', 'layout');
  return { status: data === 'no_partner' ? 'no_partner' : 'agreed' };
}

/** Withdraw: closes the couple view for both partners straight away. */
export async function withdrawCoupleView(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('withdraw_couple_consent');
  revalidatePath('/[locale]/dashboard', 'layout');
  return { ok: !error };
}
