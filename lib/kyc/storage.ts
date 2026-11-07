import 'server-only';
/**
 * The kyc-documents bucket (task 14). Private, with no policies for signed-in
 * users: everything here uses the service role, and only after the caller's
 * own checks (the professional uploading into their own folder, or an admin
 * passing kyc_admin_document_allowed()).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptDocument, encryptDocument } from './crypto';
import { isDocumentKind, MAX_PAGES, type DocumentKind } from './types';

export const KYC_BUCKET = 'kyc-documents';
export const PHOTO_BUCKET = 'pro-photos';

/** <user_id>/<draft_id>/<kind>-<page>  — draft ids are random UUIDs from the browser. */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH = new RegExp(`^(${UUID})/(${UUID})/(licence|id|selfie)-([1-5])$`);

export function documentPath(userId: string, draftId: string, kind: DocumentKind, page: number): string | null {
  if (!new RegExp(`^${UUID}$`).test(draftId) || !isDocumentKind(kind)) return null;
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES[kind]) return null;
  return `${userId}/${draftId}/${kind}-${page}`;
}

export function parseDocumentPath(path: string): { userId: string; draftId: string; kind: DocumentKind; page: number } | null {
  const m = PATH.exec(path);
  if (!m) return null;
  const kind = m[3] as DocumentKind;
  const page = Number(m[4]);
  if (page > MAX_PAGES[kind]) return null;
  return { userId: m[1], draftId: m[2], kind, page };
}

/** True when every path is the user's own and from one draft. */
export function pathsBelongTo(paths: string[], userId: string): boolean {
  const drafts = new Set<string>();
  for (const p of paths) {
    const parsed = parseDocumentPath(p);
    if (!parsed || parsed.userId !== userId) return false;
    drafts.add(parsed.draftId);
  }
  return drafts.size <= 1;
}

export async function storeDocument(admin: SupabaseClient, path: string, plain: Buffer): Promise<boolean> {
  const { error } = await admin.storage
    .from(KYC_BUCKET)
    .upload(path, encryptDocument(plain), { contentType: 'application/octet-stream', upsert: true });
  if (error) console.error(`kyc upload failed: ${error.message}`);
  return !error;
}

export async function readDocument(admin: SupabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await admin.storage.from(KYC_BUCKET).download(path);
  if (error || !data) return null;
  try {
    return decryptDocument(Buffer.from(await data.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Deletes documents. Returns true when nothing is left behind. */
export async function deleteDocuments(admin: SupabaseClient, paths: string[]): Promise<boolean> {
  const list = paths.filter(Boolean);
  if (list.length === 0) return true;
  const { error } = await admin.storage.from(KYC_BUCKET).remove(list);
  if (error) {
    console.error(`kyc delete failed: ${error.message}`);
    return false;
  }
  return true;
}

/** Abandoned drafts and anything a failed delete left behind (daily). */
export async function sweepOrphans(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.rpc('kyc_orphaned_objects', { p_age_seconds: 86400, p_limit: 500 });
  if (error) {
    console.error(`kyc sweep failed: ${error.message}`);
    return 0;
  }
  const names = (data as string[] | null) ?? [];
  return (await deleteDocuments(admin, names)) ? names.length : 0;
}

/** Stored pages start with one type byte (0 = JPEG, 1 = PDF), see /api/kyc/upload. */
export function unpackDocument(stored: Buffer): { mediaType: 'image/jpeg' | 'application/pdf'; data: Buffer } {
  return { mediaType: stored[0] === 1 ? 'application/pdf' : 'image/jpeg', data: stored.subarray(1) };
}

/** Pages actually uploaded for a draft, by kind and page number. */
export async function listDraft(admin: SupabaseClient, userId: string, draftId: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(KYC_BUCKET).list(`${userId}/${draftId}`, { limit: 20 });
  if (error || !data) return [];
  return data.map((o) => `${userId}/${draftId}/${o.name}`).filter((p) => parseDocumentPath(p) !== null);
}
