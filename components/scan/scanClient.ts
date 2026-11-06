'use client';
/**
 * Browser side of the scan flow (task 12):
 * - turns a photo or file into a page: images are redrawn onto a canvas as
 *   JPEG (which drops EXIF and location data, and converts HEIC where the
 *   browser can open it), then checked for blur and darkness;
 * - uploads pages to the private bucket under the user's own folder;
 * - reads the server's progress events.
 */
import { createClient } from '@/lib/supabase/browser';
import { assessQuality, toGrey, type Quality } from '@/lib/scan/quality';
import type { DraftFinding, EntryPoint, ScanDraft, ScanFailure, ScanStep } from '@/lib/scan/types';

export const MAX_PAGES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,application/pdf,.heic,.heif,.pdf,.jpg,.jpeg,.png';

export type Page = {
  id: string;
  name: string;
  kind: 'image' | 'pdf';
  blob: Blob;
  /** Object URL for the thumbnail (images only). */
  preview: string | null;
  quality: Quality | null;
};

export class PageProblem extends Error {
  constructor(readonly reason: 'file_type' | 'file_too_large' | 'heic_unsupported' | 'unreadable') {
    super(reason);
  }
}

const MAX_SIDE = 2000;

function isHeic(file: File): boolean {
  return /image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img>, which can open HEIC in Safari.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Redraws an image as a clean JPEG and measures its quality on a small copy. */
async function cleanImage(blob: Blob): Promise<{ jpeg: Blob; quality: Quality }> {
  const source = await decode(blob);
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!w || !h) throw new PageProblem('unreadable');
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PageProblem('unreadable');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const small = document.createElement('canvas');
  const s = Math.min(1, 600 / Math.max(canvas.width, canvas.height));
  small.width = Math.max(1, Math.round(canvas.width * s));
  small.height = Math.max(1, Math.round(canvas.height * s));
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx?.drawImage(canvas, 0, 0, small.width, small.height);
  const pixels = sctx?.getImageData(0, 0, small.width, small.height).data;
  const quality = pixels ? assessQuality(toGrey(pixels), small.width, small.height) : { dark: false, blurry: false, brightness: 0, sharpness: 0 };

  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!jpeg) throw new PageProblem('unreadable');
  return { jpeg, quality };
}

export async function pageFromFile(file: File | Blob, name: string): Promise<Page> {
  const id = crypto.randomUUID();
  if (file.size > MAX_FILE_BYTES) throw new PageProblem('file_too_large');
  const type = file.type;
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
    return { id, name, kind: 'pdf', blob: file, preview: null, quality: null };
  }
  const heic = file instanceof File && isHeic(file);
  if (!/^image\/(jpeg|png|heic|heif)$/.test(type) && !heic) throw new PageProblem('file_type');
  try {
    const { jpeg, quality } = await cleanImage(file);
    return { id, name, kind: 'image', blob: jpeg, preview: URL.createObjectURL(jpeg), quality };
  } catch (error) {
    if (heic) throw new PageProblem('heic_unsupported');
    throw error instanceof PageProblem ? error : new PageProblem('unreadable');
  }
}

export function releasePage(page: Page) {
  if (page.preview) URL.revokeObjectURL(page.preview);
}

/** Uploads each page to scan-uploads/<user_id>/<uuid>. Returns the paths. */
export async function uploadPages(pages: Page[]): Promise<string[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('signed_out');
  const paths: string[] = [];
  try {
    for (const page of pages) {
      const path = `${user.id}/${crypto.randomUUID()}`;
      const { error } = await supabase.storage
        .from('scan-uploads')
        .upload(path, page.blob, { contentType: page.kind === 'pdf' ? 'application/pdf' : 'image/jpeg', upsert: false });
      if (error) throw new Error('upload_failed');
      paths.push(path);
    }
  } catch (error) {
    // Don't leave anything behind if one page fails.
    if (paths.length) await supabase.storage.from('scan-uploads').remove(paths);
    throw error;
  }
  return paths;
}

export type ScanHandlers = { onStep: (step: ScanStep) => void };

/** Starts reading. Resolves with the draft, or rejects with a ScanFailure code. */
export async function readReport(
  paths: string[],
  names: string[],
  entry: EntryPoint,
  signal: AbortSignal,
  { onStep }: ScanHandlers,
): Promise<ScanDraft> {
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths, names, entry }),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => ({}))) as { code?: ScanFailure };
    throw new ScanFailed(body.code ?? 'failed');
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.+)$/m.exec(raw)?.[1];
      const data = /^data: (.+)$/m.exec(raw)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data) as { step?: ScanStep; code?: ScanFailure } & ScanDraft;
      if (event === 'step' && payload.step) onStep(payload.step);
      if (event === 'error') throw new ScanFailed(payload.code ?? 'failed');
      if (event === 'draft') return payload as ScanDraft;
    }
  }
  throw new ScanFailed('failed');
}

export class ScanFailed extends Error {
  constructor(readonly code: ScanFailure) {
    super(code);
  }
}

export function logScanEvent(name: string, props: Record<string, string | number>) {
  void fetch('/api/scan/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, props }),
    keepalive: true,
  }).catch(() => {});
}

export type { DraftFinding };
