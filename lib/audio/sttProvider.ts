import 'server-only';
/**
 * Cloud speech-to-text (task 13, section 4 step 1). Used when STT_PROVIDER
 * is set; otherwise the browser's built-in speech recognition is used.
 * Audio is held in memory for this one call and never stored or logged.
 *
 * Supported: STT_PROVIDER=azure, with AZURE_SPEECH_KEY and
 * AZURE_SPEECH_REGION (the same keys as the cloud voices). Gulf Arabic
 * (ar-AE) and English (en-US). Short audio only (up to 60 seconds).
 */
export type SttLocale = 'ar' | 'en';

type Provider = { name: string; transcribe(wav: ArrayBuffer, locale: SttLocale): Promise<string> };

function azure(): Provider | null {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return null;
  return {
    name: 'azure',
    async transcribe(wav, locale) {
      const lang = locale === 'ar' ? 'ar-AE' : 'en-US';
      const response = await fetch(
        `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=simple&profanity=raw`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            Accept: 'application/json',
            'User-Agent': 'genebridge',
          },
          body: wav,
        },
      );
      if (!response.ok) throw new Error(`stt ${response.status}`);
      const body = (await response.json()) as { RecognitionStatus?: string; DisplayText?: string };
      return body.RecognitionStatus === 'Success' ? (body.DisplayText ?? '') : '';
    },
  };
}

export function sttProvider(): Provider | null {
  return process.env.STT_PROVIDER === 'azure' ? azure() : null;
}
