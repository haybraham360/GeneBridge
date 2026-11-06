import 'server-only';
/**
 * Cloud text-to-speech (task 12, section 6). Used when TTS_PROVIDER and its
 * key are set; otherwise the browser's built-in speech is used.
 *
 * Supported: TTS_PROVIDER=azure, with AZURE_SPEECH_KEY and
 * AZURE_SPEECH_REGION. Voices default to a Gulf Arabic voice (ar-AE) and a
 * British English voice; override with TTS_VOICE_AR / TTS_VOICE_EN.
 */
export type TtsLocale = 'ar' | 'en';

type Provider = {
  name: string;
  voice(locale: TtsLocale): { lang: string; voice: string };
  synthesize(text: string, locale: TtsLocale): Promise<Buffer>;
};

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
      const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}"><prosody rate="-5%">${escapeXml(text)}</prosody></voice></speak>`;
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
  return process.env.TTS_PROVIDER === 'azure' ? azure() : null;
}
