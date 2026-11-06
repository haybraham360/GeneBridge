import { readFileSync, existsSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { PageError, preparePage, sniff } = await import('./images');

describe('page cleaning before the model sees anything', () => {
  it('re-encodes photos as JPEG with no metadata (EXIF, GPS)', async () => {
    const photo = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#fff' } })
      .jpeg()
      .withExif({ IFD0: { Artist: 'Mariam Samplewoman', Copyright: 'x' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '24/1 27/1 0/1' } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();

    const page = await preparePage(photo);
    expect(page.mediaType).toBe('image/jpeg');
    const meta = await sharp(page.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(page.data.includes(Buffer.from('Mariam'))).toBe(false);
  });

  it('removes PDF document metadata that could hold a name', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setAuthor('Mariam Samplewoman');
    doc.setTitle('Report for Mariam Samplewoman');
    const page = await preparePage(Buffer.from(await doc.save()));
    expect(page.mediaType).toBe('application/pdf');
    const cleaned = await PDFDocument.load(page.data);
    expect(cleaned.getAuthor() ?? '').toBe('');
    expect(cleaned.getTitle() ?? '').toBe('');
    expect(page.data.includes(Buffer.from('Mariam'))).toBe(false);
  });

  it('checks the real file type, not the name', async () => {
    await expect(preparePage(Buffer.from('<html>not a report</html>'))).rejects.toBeInstanceOf(PageError);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(16)]);
    expect(sniff(heic)).toBe('heic');
    await expect(preparePage(heic)).rejects.toMatchObject({ reason: 'file_type' });
  });

  it('refuses files over 10 MB', async () => {
    await expect(preparePage(Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toMatchObject({ reason: 'file_too_large' });
  });

  it.skipIf(!existsSync('samples/reports/mariam-report.pdf'))('accepts the sample report PDF', async () => {
    const page = await preparePage(readFileSync('samples/reports/mariam-report.pdf'));
    expect(page.mediaType).toBe('application/pdf');
  });
});
