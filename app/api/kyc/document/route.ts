/**
 * Serves one verification document page to an admin (task 14, section 6).
 *
 *   GET /api/kyc/document?submission=<id>&path=<storage path>
 *
 * The admin's own session must pass kyc_admin_document_allowed() (admin role,
 * and the path belongs to that submission); the view is audited. The file is
 * decrypted on the server and sent with no-store, so nothing is cached.
 */
import { readDocument, unpackDocument } from '@/lib/kyc/storage';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const submission = url.searchParams.get('submission');
  const path = url.searchParams.get('path');
  if (!submission || !path) return notFound();

  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc('kyc_admin_document_allowed', { p_id: submission, p_path: path });
  if (error || allowed !== true) return notFound();

  const stored = await readDocument(createAdminClient(), path);
  if (!stored) return notFound();
  await supabase.rpc('kyc_admin_log', { p_id: submission, p_action: 'document_viewed' });

  const { mediaType, data } = unpackDocument(stored);
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': mediaType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
