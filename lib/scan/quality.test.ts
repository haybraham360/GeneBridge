import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { assessQuality } from './quality';

/** The same small greyscale copy the browser measures (components/scan/scanClient.ts). */
async function measure(file: string) {
  const { data, info } = await sharp(file)
    .resize({ width: 600, height: 600, fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return assessQuality(data, info.width, info.height);
}

const dir = 'samples/reports';
const haveSamples = existsSync(`${dir}/blurry-photo.jpg`);

describe.skipIf(!haveSamples)('photo quality check on the sample photos', () => {
  it('warns about the blurry photo', async () => {
    expect((await measure(`${dir}/blurry-photo.jpg`)).blurry).toBe(true);
  });

  it('accepts the angled and flat photos', async () => {
    for (const file of ['khalid-report-photo.jpg', 'injection-report.jpg']) {
      const q = await measure(`${dir}/${file}`);
      expect(q.blurry, file).toBe(false);
      expect(q.dark, file).toBe(false);
    }
  });
});

describe('photo quality check', () => {
  it('flags a dark, flat image', () => {
    const grey = new Uint8Array(100 * 100).fill(20);
    expect(assessQuality(grey, 100, 100)).toMatchObject({ dark: true, blurry: true });
  });

  it('accepts a bright, detailed image', () => {
    const grey = Uint8Array.from({ length: 100 * 100 }, (_, i) => ((i % 100) + Math.floor(i / 100)) % 2 === 0 ? 240 : 40);
    expect(assessQuality(grey, 100, 100)).toMatchObject({ dark: false, blurry: false });
  });
});
