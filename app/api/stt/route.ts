/**
 * Cloud speech-to-text (task 13). GET → { provider: string | null } so the
 * browser knows whether to record audio or use its own recognition.
 * POST audio/wav (16 kHz mono, at most 60 seconds) with ?locale=ar|en →
 * { text }. The audio is never stored or logged. Signed-in users only.
 */
import { sttProvider } from '@/lib/audio/sttProvider';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 60 seconds of 16-bit 16 kHz mono, plus the header.
const MAX_BYTES = 16_000 * 2 * 60 + 44;

export async function GET() {
  return Response.json({ provider: sttProvider()?.name ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const provider = sttProvider();
  if (!provider) return Response.json({ code: 'not_set_up' }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ code: 'signed_out' }, { status: 401 });

  const locale = new URL(request.url).searchParams.get('locale') === 'ar' ? 'ar' : 'en';
  const audio = await request.arrayBuffer();
  if (audio.byteLength < 44 || audio.byteLength > MAX_BYTES) return Response.json({ code: 'too_long' }, { status: 400 });
  try {
    const text = await provider.transcribe(audio, locale);
    return Response.json({ text: text.slice(0, 1000) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ code: 'failed' }, { status: 502 });
  }
}
