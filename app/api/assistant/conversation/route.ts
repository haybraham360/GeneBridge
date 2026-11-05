/**
 * Load or delete the caller's conversation (owner-only by RLS).
 *   GET    ?id=…   → { messages: [{ id, role, content, meta }] }
 *   DELETE ?id=…   → removes the conversation and its messages immediately
 */
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

export async function GET(request: Request) {
  const supabase = await signedIn();
  if (!supabase) return Response.json({ messages: [] }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ messages: [] });
  const { data } = await supabase
    .from('assistant_messages')
    .select('id, role, content, meta')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(100);
  return Response.json({ messages: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const supabase = await signedIn();
  if (!supabase) return Response.json({ ok: false }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ ok: false }, { status: 400 });
  const { error } = await supabase.from('assistant_conversations').delete().eq('id', id);
  return Response.json({ ok: !error });
}
