'use server';

import { logEvents } from '@/lib/auth/events';
import { createClient } from '@/lib/supabase/server';

const questions = ['carrier_ill', 'different_condition', 'who_explains'] as const;

/** The results teach-back: right or wrong per question, never anything else. */
export async function logResultsTeachback(answers: { question: string; correct: boolean }[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !Array.isArray(answers)) return;
  const events = answers
    .filter((a) => (questions as readonly string[]).includes(a.question) && typeof a.correct === 'boolean')
    .map((a) => ({ name: 'teachback_answered', props: { phase: 'post', question: `results_${a.question}`, correct: a.correct } }));
  await logEvents(supabase, user.id, events);
}
