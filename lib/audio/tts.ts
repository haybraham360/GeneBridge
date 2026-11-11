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

/** Higher-quality voices browsers expose: Edge "Online (Natural)", Safari/macOS "Premium"/"Enhanced"/Siri, Chrome "Google". */
const NATURAL = /natural|neural|online|premium|enhanced|siri/i;
const NETWORK = /google/i;
/** Robotic or novelty voices (eSpeak, macOS compact and character voices) — only used as a last resort. */
const ROBOTIC =
  /compact|espeak|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;

/** A zero-length WAV, played inside the tap to unlock an audio element on phones. */
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
/** One shared element: once a tap has unlocked it, iOS lets it play later sources too. */
let sharedAudio: HTMLAudioElement | null = null;
const unlocked = new WeakSet<HTMLAudioElement>();

/**
 * Phones (iOS Safari above all) only let audio start from inside a tap, and
 * the cloud audio arrives after a fetch. Playing a silent clip on the element
 * synchronously, during the tap, keeps it allowed to play afterwards.
 */
function unlockAudio(element: HTMLAudioElement) {
  if (unlocked.has(element)) return;
  try {
    element.src = SILENT;
    void element
      .play()
      .then(() => unlocked.add(element))
      .catch(() => {});
  } catch {
    // Not fatal: playback may still be allowed, and the browser voice is the fallback.
  }
}

let voiceCache: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // Chrome loads its voice list asynchronously; keep it warm so the first Listen tap gets the good voice.
  const load = () => (voiceCache = window.speechSynthesis.getVoices());
  load();
  window.speechSynthesis.addEventListener?.('voiceschanged', load);
}

/** Picks the most natural-sounding installed voice for the locale, preferring the regional variant on ties. */
function pickVoice(locale: SpeechLocale): SpeechSynthesisVoice | undefined {
  const voices = voiceCache.length ? voiceCache : window.speechSynthesis.getVoices();
  const langs = browserLang[locale].map((l) => l.toLowerCase());
  let best: SpeechSynthesisVoice | undefined;
  let bestScore = -Infinity;
  for (const v of voices) {
    const rank = langs.findIndex((l) => v.lang.toLowerCase().replace('_', '-').startsWith(l));
    if (rank < 0) continue;
    const name = v.name;
    const score =
      (NATURAL.test(name) ? 100 : NETWORK.test(name) ? 50 : 0) -
      (ROBOTIC.test(name) ? 200 : 0) +
      (langs.length - rank) * 5 +
      (v.default ? 1 : 0);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
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
      // No provider set up: stop asking. Signed out or a one-off failure: try again next time.
      if (response.ok) cloud = 'off';
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
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    // Natural voices are already paced for listening; slowing them makes them sound drawn out.
    utterance.rate = voice && NATURAL.test(voice.name) ? 1 : 0.95;
    utterance.onstart = () => options.onSentence?.(index);
    utterance.onend = () => playBrowser(index + 1);
    utterance.onerror = () => finish();
    window.speechSynthesis.speak(utterance);
  };

  const playCloud = (urls: string[], index: number) => {
    if (stopped || index >= urls.length || !audio) return finish();
    const element = audio;
    element.src = urls[index];
    element.onended = () => playCloud(urls, index + 1);
    element.onerror = () => finish();
    options.onSentence?.(index);
    void element.play().catch(() => {
      if (stopped) return finish();
      // Blocked by the browser (autoplay rules): read the rest with the browser voice instead of going silent.
      element.onended = element.onerror = null;
      playBrowser(index);
    });
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

  // Still inside the tap: unlock the element the cloud audio will play through.
  const element = cloud === 'off' ? null : (options.audio ?? (sharedAudio ??= new Audio()));
  if (element) unlockAudio(element);

  void cloudUrls(parts, locale).then((urls) => {
    if (stopped) return;
    if (urls && urls.length === parts.length && element) {
      audio = element;
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
