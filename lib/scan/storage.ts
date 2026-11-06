import 'server-only';
/**
 * The private scan-uploads bucket (task 12, section 3 step 1). Each upload
 * lives at scan-uploads/<user_id>/<uuid> and only its owner can read or
 * delete it (Storage RLS). Files are deleted as soon as extraction succeeds
 * or fails; a sweep removes anything older than 15 minutes in case a delete
 * failed. Generated audio (tts-cache) is swept after 24 hours.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const SCAN_BUCKET = 'scan-uploads';
export const TTS_BUCKET = 'tts-cache';
export const SCAN_MAX_AGE_SECONDS = 15 * 60;
export const TTS_MAX_AGE_SECONDS = 24 * 60 * 60;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only "<the caller's id>/<uuid>" paths are accepted from the browser. */
export function isOwnUploadPath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string') return false;
  const [folder, name, ...rest] = path.split('/');
  return rest.length === 0 && folder === userId && uuid.test(name ?? '');
}

/** Downloads an upload as the user (RLS: own files only). */
export async function downloadUpload(supabase: SupabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(SCAN_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Deletes uploads as the user. Never throws; returns whether it worked. */
export async function removeUploads(supabase: SupabaseClient, paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { error } = await supabase.storage.from(SCAN_BUCKET).remove(paths);
  if (error) console.warn('scan upload delete failed', paths.length);
  return !error;
}

/**
 * Deletes expired files in one bucket. Needs the service-role client: it
 * covers every user's folder. Returns how many it removed.
 */
export async function sweepBucket(admin: SupabaseClient, bucket: string, maxAgeSeconds: number): Promise<number> {
  const { data, error } = await admin.rpc('storage_expired_objects', { p_bucket: bucket, p_age_seconds: maxAgeSeconds });
  if (error) {
    console.warn('storage sweep lookup failed', bucket);
    return 0;
  }
  const names = ((data ?? []) as { name: string }[]).map((r) => r.name);
  if (names.length === 0) return 0;
  const { error: removeError } = await admin.storage.from(bucket).remove(names);
  if (removeError) {
    console.warn('storage sweep delete failed', bucket);
    return 0;
  }
  return names.length;
}

export async function sweepExpired(admin: SupabaseClient): Promise<{ scans: number; audio: number }> {
  const [scans, audio] = await Promise.all([
    sweepBucket(admin, SCAN_BUCKET, SCAN_MAX_AGE_SECONDS),
    sweepBucket(admin, TTS_BUCKET, TTS_MAX_AGE_SECONDS),
  ]);
  return { scans, audio };
}
