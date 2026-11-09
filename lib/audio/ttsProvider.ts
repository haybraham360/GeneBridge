import 'server-only';
/**
 * Cloud text-to-speech (task 12, section 6). Used when TTS_PROVIDER and its
 * key are set; otherwise the browser's built-in speech is used.
 *
 * Supported:
 * - TTS_PROVIDER=elevenlabs, with ELEVENLABS_API_KEY. One multilingual voice
 *   reads both languages; override with TTS_VOICE_AR / TTS_VOICE_EN (voice
 *   IDs) and TTS_MODEL.
 * - TTS_PROVIDER=azure, with AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.
 *   Voices default to a Gulf Arabic voice (ar-AE) and a British English
 *   voice; override with TTS_VOICE_AR / TTS_VOICE_EN.
 */
export type TtsLocale = 'ar' | 'en';

type Provider = {
  name: string;
  voice(locale: TtsLocale): { lang: string; voice: string };
  synthesize(text: string, locale: TtsLocale): Promise<Buffer>;
  /** Most requests to send at once (ElevenLabs' free plan allows 2). */
  concurrency?: number;
};

/** "Sarah": a premade voice available on every ElevenLabs plan, including free. */
const ELEVENLABS_DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';

function elevenlabs(): Provider | null {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  // multilingual_v2 sounds the most natural; eleven_flash_v2_5 costs half the credits.
  const model = process.env.TTS_MODEL || 'eleven_multilingual_v2';
  const voices = {
    ar: { lang: 'ar-AE', id: process.env.TTS_VOICE_AR || ELEVENLABS_DEFAULT_VOICE },
    en: { lang: 'en-GB', id: process.env.TTS_VOICE_EN || ELEVENLABS_DEFAULT_VOICE },
  } as const;
  return {
    name: 'elevenlabs',
    concurrency: 2,
    // The model is part of the cache key, so changing it re-synthesises.
    voice: (locale) => ({ lang: voices[locale].lang, voice: `${voices[locale].id}/${model}` }),
    async synthesize(text, locale) {
      const body: Record<string, unknown> = {
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      };
      // Only the v2.5 models accept a language hint; it stops short Arabic lines being read as another language.
      if (model.includes('v2_5')) body.language_code = locale;
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voices[locale].id)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(`tts ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string);
}

function azure(): Provider | null {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return null;
  const voices = {
    ar: { lang: 'ar-AE', voice: process.env.TTS_VOICE_AR || 'ar-AE-FatimaNeural' },
    en: { lang: 'en-GB', voice: process.env.TTS_VOICE_EN || 'en-GB-SoniaNeural' },
  } as const;
  return {
    name: 'azure',
    voice: (locale) => voices[locale],
    async synthesize(text, locale) {
      const { lang, voice } = voices[locale];
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="-5%">${escapeXml(text)}</prosody></voice></speak>`;
      const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'genebridge',
        },
        body: ssml,
      });
      if (!response.ok) throw new Error(`tts ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

export function ttsProvider(): Provider | null {
  switch (process.env.TTS_PROVIDER) {
    case 'elevenlabs':
      return elevenlabs();
    case 'azure':
      return azure();
    default:
      return null;
  }
}
