'use client';
/**
 * Speech to text for "Describe your family" (task 13, section 4 step 1).
 *   - With a cloud provider set up (STT_PROVIDER, see /api/stt), the
 *     microphone is recorded in the browser, converted to 16 kHz WAV and
 *     sent once for transcription. Nothing is stored.
 *   - Otherwise the browser's built-in speech recognition is used
 *     (ar-AE / en-US), with a live transcript. It sends automatically after
 *     a pause.
 * If the microphone is blocked, `error` is "denied" and typing still works.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export type SttLocale = 'ar' | 'en';
export type SttState = 'idle' | 'listening' | 'processing';
export type SttError = 'denied' | 'failed' | null;

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const canRecord = () =>
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

const noop = () => () => {};
const PAUSE_MS = 2200;
const MAX_MS = 60_000;

/** Decodes recorded audio and re-encodes it as 16 kHz mono 16-bit WAV. */
async function toWav(blob: Blob): Promise<ArrayBuffer> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = 16_000;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const samples = (await offline.startRendering()).getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  } finally {
    void ctx.close();
  }
}

export function useSpeechToText({
  locale,
  onFinal,
}: {
  locale: SttLocale;
  /** Called with the transcript when speech ends. `auto` is true after a pause (send it), false after Stop. */
  onFinal: (text: string, auto: boolean) => void;
}) {
  const browser = useSyncExternalStore(noop, () => recognitionCtor() !== null, () => false);
  const recorder = useSyncExternalStore(noop, canRecord, () => false);
  const [cloud, setCloud] = useState(false);
  const [state, setState] = useState<SttState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<SttError>(null);
  const recognition = useRef<Recognition | null>(null);
  const media = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);
  const timers = useRef<{ pause?: number; max?: number }>({});
  const finalText = useRef('');
  const autoStop = useRef(false);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  useEffect(() => {
    let live = true;
    fetch('/api/stt')
      .then((r) => (r.ok ? r.json() : { provider: null }))
      .then((b: { provider: string | null }) => live && setCloud(Boolean(b.provider)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const clearTimers = () => {
    window.clearTimeout(timers.current.pause);
    window.clearTimeout(timers.current.max);
  };

  const stop = useCallback(() => {
    clearTimers();
    recognition.current?.stop();
    if (media.current && media.current.rec.state !== 'inactive') media.current.rec.stop();
  }, []);

  const startBrowser = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = locale === 'ar' ? 'ar-AE' : 'en-US';
    r.interimResults = true;
    r.continuous = true;
    finalText.current = '';
    autoStop.current = false;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) finalText.current = `${finalText.current} ${text}`.trim();
        else interim += text;
      }
      setTranscript(`${finalText.current} ${interim}`.trim());
      window.clearTimeout(timers.current.pause);
      timers.current.pause = window.setTimeout(() => {
        autoStop.current = true;
        r.stop();
      }, PAUSE_MS);
    };
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' || e.error === 'aborted' ? null : 'failed');
    };
    r.onend = () => {
      clearTimers();
      setState('idle');
      recognition.current = null;
      const text = finalText.current.trim();
      if (text) onFinalRef.current(text, autoStop.current);
    };
    recognition.current = r;
    setTranscript('');
    setError(null);
    setState('listening');
    timers.current.max = window.setTimeout(() => r.stop(), MAX_MS);
    try {
      r.start();
    } catch {
      setState('idle');
      setError('failed');
    }
  }, [locale]);

  const startCloud = useCallback(async () => {
    setError(null);
    setTranscript('');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'failed');
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      media.current = null;
      setState('processing');
      try {
        const wav = await toWav(new Blob(chunks, { type: rec.mimeType }));
        const res = await fetch(`/api/stt?locale=${locale}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
        const body = (await res.json().catch(() => ({}))) as { text?: string };
        if (!res.ok) throw new Error('stt');
        const text = (body.text ?? '').trim();
        setTranscript(text);
        if (text) onFinalRef.current(text, false);
      } catch {
        setError('failed');
      } finally {
        setState('idle');
      }
    };
    media.current = { rec, stream, chunks };
    rec.start();
    setState('listening');
    timers.current.max = window.setTimeout(() => rec.state !== 'inactive' && rec.stop(), MAX_MS);
  }, [locale]);

  const start = useCallback(() => {
    if (cloud && recorder) void startCloud();
    else startBrowser();
  }, [cloud, recorder, startBrowser, startCloud]);

  useEffect(
    () => () => {
      clearTimers();
      recognition.current?.abort();
      media.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return {
    supported: browser || (cloud && recorder),
    state,
    transcript,
    error,
    start,
    stop,
    clearError: () => setError(null),
  };
}
