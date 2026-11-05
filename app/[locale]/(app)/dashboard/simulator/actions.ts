'use server';
/**
 * Logs `simulator_run` (PROJECT.md section 7). Props are the pattern and how
 * many pregnancies were simulated: never the condition, which could say
 * something personal about why someone is exploring it.
 */
import { z } from 'zod';
import { logEvents } from '@/lib/auth/events';
import { patterns } from '@/lib/genetics/inheritance';
import { createClient } from '@/lib/supabase/server';

const input = z.object({ pattern: z.enum(patterns), runs: z.union([z.literal(1), z.literal(100)]) });

export async function logSimulatorRun(pattern: string, runs: number): Promise<void> {
  const parsed = input.safeParse({ pattern, runs });
  if (!parsed.success) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await logEvents(supabase, user.id, [{ name: 'simulator_run', props: parsed.data }]);
}
