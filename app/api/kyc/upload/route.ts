/**
 * One verification document page (task 14). POST multipart/form-data:
 *
 *   draft  random UUID for this verification attempt (from the browser)
 *   kind   licence | id | selfie
 *   page   1-based page number
 *   file   the photo (JPEG/PNG; PDF allowed for the licence)
 *
 * The page is re-encoded (EXIF and PDF metadata removed), encrypted with
 * AES-256-GCM and stored in the private kyc-documents bucket at
 * <user_id>/<draft>/<kind>-<page>. Only a professional who may submit now can
 * upload, and only into their own folder. Nothing about the file is logged.
 */
import { kycEncryptionAvailable } from '@/lib/kyc/crypto';
import { documentPath, storeDocument } from '@/lib/kyc/storage';
import { isDocumentKind } from '@/lib/kyc/types';
import { PageError, preparePage } from '@/lib/scan/images';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ code: 'signed_out' }, 401);

  // Professionals who may submit now (not verified, not suspended, nothing open).
  const { data: allowed } = await supabase.rpc('kyc_can_submit', { p_user: user.id });
  if (allowed !== true) return json({ code: 'not_allowed' }, 403);
  if (!kycEncryptionAvailable()) return json({ code: 'not_configured' }, 503);

  const form = await request.formData().catch(() => null);
  const draft = form?.get('draft');
  const kind = form?.get('kind');
  const page = Number(form?.get('page'));
  const file = form?.get('file');
  if (typeof draft !== 'string' || !isDocumentKind(kind) || !(file instanceof Blob)) return json({ code: 'bad_request' }, 400);
  const path = documentPath(user.id, draft, kind, page);
  if (!path) return json({ code: 'bad_request' }, 400);

  let prepared;
  try {
    prepared = await preparePage(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return json({ code: error instanceof PageError ? error.reason : 'unreadable' }, 400);
  }
  // ID photos and selfies must be images; a licence may be a PDF certificate.
  if (prepared.mediaType === 'application/pdf' && kind !== 'licence') return json({ code: 'file_type' }, 400);

  // The type is kept in the first byte so the review screen can show it.
  const typed = Buffer.concat([Buffer.from([prepared.mediaType === 'application/pdf' ? 1 : 0]), prepared.data]);
  const ok = await storeDocument(createAdminClient(), path, typed);
  return ok ? json({ path }, 200) : json({ code: 'upload_failed' }, 500);
}
