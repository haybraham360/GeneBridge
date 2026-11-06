import 'server-only';
/**
 * Checks and cleans each uploaded page before anything is sent to the model
 * (task 12, section 5):
 * - the real file type is read from the bytes, not the name or header;
 * - images are decoded and re-encoded as JPEG, which drops all metadata
 *   (EXIF, GPS location, camera details) and applies the photo's rotation;
 * - PDFs lose their document metadata (title, author, XMP), which can hold
 *   a name.
 */
import { PDFDocument, PDFName } from 'pdf-lib';
import sharp from 'sharp';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PAGES = 5;
const MAX_SIDE = 2000;

export type PreparedPage = { mediaType: 'image/jpeg' | 'application/pdf'; data: Buffer };

export class PageError extends Error {
  constructor(readonly reason: 'file_type' | 'file_too_large' | 'unreadable') {
    super(reason);
  }
}

export type SniffedType = 'jpeg' | 'png' | 'heic' | 'pdf';

/** The file's real type from its first bytes. */
export function sniff(data: Uint8Array): SniffedType | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png';
  if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) return 'pdf'; // %PDF
  const brand = String.fromCharCode(...data.subarray(4, 12));
  if (brand.startsWith('ftyp') && /heic|heix|hevc|mif1|msf1/.test(brand.slice(4))) return 'heic';
  return null;
}

async function cleanImage(data: Buffer): Promise<Buffer> {
  try {
    return await sharp(data, { failOn: 'error', limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new PageError('unreadable');
  }
}

async function cleanPdf(data: Buffer): Promise<Buffer> {
  try {
    const doc = await PDFDocument.load(data, { updateMetadata: false });
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
    doc.catalog.delete(PDFName.of('Metadata'));
    if (doc.getPageCount() === 0 || doc.getPageCount() > 20) throw new PageError('unreadable');
    return Buffer.from(await doc.save({ useObjectStreams: false }));
  } catch (error) {
    // Encrypted or broken PDFs can't be read.
    throw error instanceof PageError ? error : new PageError('unreadable');
  }
}

export async function preparePage(data: Buffer): Promise<PreparedPage> {
  if (data.length > MAX_FILE_BYTES) throw new PageError('file_too_large');
  const type = sniff(data);
  if (type === 'pdf') return { mediaType: 'application/pdf', data: await cleanPdf(data) };
  if (type === 'jpeg' || type === 'png') return { mediaType: 'image/jpeg', data: await cleanImage(data) };
  // HEIC is converted to JPEG in the browser; the server can't decode it.
  throw new PageError('file_type');
}
