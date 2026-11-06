/**
 * Listen mode, everywhere (task 12, section 6). Replaces direct use of
 * lib/audio/speak.ts: with a cloud voice set up (TTS_PROVIDER), sentences
 * are played as natural-sounding audio (Gulf Arabic ar-AE, or English);
 * otherwise the browser's built-in speech reads them. Either way it reports
 * which sentence is being read, for captions.
 *
 * Browser-only: call from event handlers or effects.
 */
import { isSpeechSupported as browserSpeech, stopSpeaking as stopBrowser, type SpeechLocale } from './speak';

export type { SpeechLocale };

export type NarrateOptions = {
  /** Called as each sentence starts (index into `sentences`). */
  onSentence?: (index: number) => void;
  /** Called once, when it finishes, fails or is stopped. */
  onEnd?: () => void;
  /** Play cloud audio through this element (it carries the lang attribute). */
  audio?: HTMLAudioElement | null;
};

export type Narration = { stop: () => void; pause: () => void; resume: () => void };

const browserLang: Record<SpeechLocale, string[]> = { ar: ['ar-AE', 'ar-SA', 'ar'], en: ['en-GB', 'en-US', 'en'] };

/** Cloud voice availability, learned from the first /api/tts reply. */
let cloud: 'unknown' | 'on' | 'off' = 'unknown';
let current: Narration | null = null;

export function isSpeechSupported(): boolean {
  return browserSpeech() || cloud === 'on';
}

/** Splits text into sentences (both languages), so captions can follow along. */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?؟]+[.!?؟]+["')\]]*|[^.!?؟]+$/gu) ?? []).map((s) => s.trim()).filter(Boolean);
}

function pickVoice(locale: SpeechLocale): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  for (const lang of browserLang[locale]) {
    const match = voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
    if (match) return match;
  }
  return undefined;
}

async function cloudUrls(sentences: string[], locale: SpeechLocale): Promise<string[] | null> {
  if (cloud === 'off') return null;
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentences, locale }),
    });
    const body = (await response.json().catch(() => ({}))) as { provider?: string | null; urls?: string[] };
    if (!response.ok || !body.provider || !body.urls?.length) {
      // No provider set up: stop asking. A one-off failure: try again next time.
      if (response.ok || response.status === 401) cloud = 'off';
      return null;
    }
    cloud = 'on';
    return body.urls;
  } catch {
    return null;
  }
}

/**
 * Reads the sentences aloud in order, stopping anything already playing.
 */
export function narrate(sentences: string[], locale: SpeechLocale, options: NarrateOptions = {}): Narration {
  current?.stop();
  const parts = sentences.map((s) => s.trim()).filter(Boolean);
  let stopped = false;
  let finished = false;
  let audio: HTMLAudioElement | null = null;
  let browser = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (current === narration) current = null;
    options.onEnd?.();
  };

  const playBrowser = (index: number) => {
    browser = true;
    if (stopped || index >= parts.length || !browserSpeech()) return finish();
    const utterance = new SpeechSynthesisUtterance(parts[index]);
    utterance.lang = browserLang[locale][0];
    const voice = pickVoice(locale);
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.onstart = () => options.onSentence?.(index);
    utterance.onend = () => playBrowser(index + 1);
    utterance.onerror = () => finish();
    window.speechSynthesis.speak(utterance);
  };

  const playCloud = (urls: string[], index: number) => {
    if (stopped || index >= urls.length || !audio) return finish();
    audio.src = urls[index];
    audio.onended = () => playCloud(urls, index + 1);
    audio.onerror = () => finish();
    options.onSentence?.(index);
    void audio.play().catch(() => finish());
  };

  const narration: Narration = {
    stop() {
      stopped = true;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
      }
      if (browser) stopBrowser();
      finish();
    },
    pause() {
      if (audio && !audio.paused) audio.pause();
      if (browser && browserSpeech()) window.speechSynthesis.pause();
    },
    resume() {
      if (audio?.src) void audio.play().catch(() => {});
      if (browser && browserSpeech()) window.speechSynthesis.resume();
    },
  };
  current = narration;

  if (parts.length === 0) {
    finish();
    return narration;
  }
  if (browserSpeech()) window.speechSynthesis.cancel();

  void cloudUrls(parts, locale).then((urls) => {
    if (stopped) return;
    if (urls && urls.length === parts.length) {
      audio = options.audio ?? new Audio();
      playCloud(urls, 0);
    } else {
      playBrowser(0);
    }
  });
  return narration;
}

/**
 * Same shape as speak() in lib/audio/speak.ts: reads `text` aloud and
 * returns a function that stops it.
 */
export function speak(text: string, locale: SpeechLocale, { onEnd }: { onEnd?: () => void } = {}): () => void {
  const n = narrate(splitSentences(text), locale, { onEnd });
  return () => n.stop();
}

export function stopSpeaking() {
  current?.stop();
  stopBrowser();
}
