'use client';

/** Counts one talk event (task 09). Names and small props only. Survives navigation. */
export function sendTalkEvent(event: { name: string; guide?: string; channel?: string }) {
  const body = JSON.stringify(event);
  if (typeof navigator !== 'undefined' && navigator.sendBeacon?.('/api/talk/event', new Blob([body], { type: 'application/json' }))) {
    return;
  }
  void fetch('/api/talk/event', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
    () => {},
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
