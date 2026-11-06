/**
 * Spoken explanations (task 12, section 6). POST { sentences: string[],
 * locale: "ar" | "en" }; returns { provider: null } when no cloud voice is set
 * up (the browser speaks instead), or one short-lived audio URL per
 * sentence, so captions can follow sentence by sentence.
 *
 * Audio is cached per sentence, voice and locale for 24 hours in the private
 * tts-cache bucket, under the user's own folder, then deleted by the sweep.
 * Signed-in users only.
 */
import { createHash } from 'node:crypto';
import { ttsProvider, type TtsLocale } from '@/lib/audio/ttsProvider';
import { TTS_BUCKET } from '@/lib/scan/storage';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_SENTENCES = 40;
const MAX_SENTENCE = 600;

export async function POST(request: Request) {
  const provider = ttsProvider();
  if (!provider) return Response.json({ provider: null }, { headers: { 'Cache-Control': 'no-store' } });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ provider: null }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { sentences?: unknown; locale?: unknown };
  const locale: TtsLocale = body.locale === 'ar' ? 'ar' : 'en';
  const sentences = (Array.isArray(body.sentences) ? body.sentences : [])
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .slice(0, MAX_SENTENCES)
    .map((s) => s.trim().slice(0, MAX_SENTENCE));
  if (sentences.length === 0) return Response.json({ code: 'empty' }, { status: 400 });

  const { lang, voice } = provider.voice(locale);
  const bucket = supabase.storage.from(TTS_BUCKET);
  try {
    const urls = await Promise.all(
      sentences.map(async (sentence) => {
        const hash = createHash('sha256').update(`${provider.name}|${voice}|${sentence}`).digest('hex');
        const path = `${user.id}/${hash}.mp3`;
        const existing = await bucket.createSignedUrl(path, 600);
        if (existing.data?.signedUrl) return existing.data.signedUrl;
        const audio = await provider.synthesize(sentence, locale);
        const { error } = await bucket.upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
        if (error) throw new Error('tts cache upload failed');
        const signed = await bucket.createSignedUrl(path, 600);
        if (!signed.data?.signedUrl) throw new Error('tts sign failed');
        return signed.data.signedUrl;
      }),
    );
    return Response.json({ provider: provider.name, lang, urls }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // The browser falls back to its own voice.
    return Response.json({ provider: null }, { status: 502 });
  }
}
