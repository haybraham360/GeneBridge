'use server';

/*
 * Privacy & consent actions (task 15). Revoking runs as the signed-in owner:
 * RLS lets people revoke only their own grants, and the professional loses
 * access on their next read.
 */
import { revalidatePath } from 'next/cache';
import { logEvents } from '@/lib/auth/events';
import { createClient } from '@/lib/supabase/server';

/** Stops sharing everything with one person. */
export async function revokeAccess(granteeId: string): Promise<{ ok: boolean }> {
  if (typeof granteeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(granteeId)) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { ok: false };

  const { data: revoked, error } = await supabase
    .from('share_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('owner_id', userId)
    .eq('grantee_id', granteeId)
    .is('revoked_at', null)
    .select('resource');
  if (error) return { ok: false };

  await logEvents(supabase, userId, [{ name: 'share_revoked', props: { items: revoked?.length ?? 0 } }]);
  revalidatePath('/[locale]/dashboard', 'layout');
  return { ok: true };
}
