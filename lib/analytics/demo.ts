import 'server-only';
import { cache } from 'react';
import { isDemoMode } from '@/lib/demo/mode';
import { createClient } from '@/lib/supabase/server';

/**
 * Guardrail 12: every synthetic figure is labelled "Synthetic demo data".
 * The label shows in demo mode, and otherwise only while synthetic analytics
 * data (task 05, profiles.is_synthetic) actually exists, so real figures are
 * never mislabelled and synthetic ones always are. Checked once per request.
 */
export const showSyntheticLabel = cache(async (): Promise<boolean> => {
  if (isDemoMode()) return true;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('synthetic_data_present');
  // If the check fails, label the figures: wrongly labelled is safer than unlabelled.
  return error ? true : data === true;
});
