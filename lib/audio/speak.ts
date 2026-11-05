/**
 * Listen mode. Today this uses the browser's built-in speech; recorded audio
 * files can replace it later without touching the screens that call it.
 * Browser-only: call from event handlers or effects.
 */

export type SpeechLocale = 'ar' | 'en';

const speechLang: Record<SpeechLocale, string> = { ar: 'ar-SA', en: 'en-GB' };

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

function voiceFor(locale: SpeechLocale): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(locale));
  return matching.find((v) => v.default) ?? matching.find((v) => v.localService) ?? matching[0];
}

/**
 * Reads `text` aloud in the locale's voice, stopping anything already
 * playing. `onEnd` runs once, when it finishes, fails or is stopped.
 * Returns a function that stops it.
 */
export function speak(
  text: string,
  locale: SpeechLocale,
  { onEnd }: { onEnd?: () => void } = {},
): () => void {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onEnd?.();
  };

  if (!isSpeechSupported() || !text.trim()) {
    finish();
    return () => {};
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLang[locale];
  const voice = voiceFor(locale);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.95;
  utterance.onend = finish;
  utterance.onerror = finish;
  synth.speak(utterance);

  return () => {
    if (!finished) synth.cancel();
    finish();
  };
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
