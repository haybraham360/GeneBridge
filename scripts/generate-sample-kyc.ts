/**
 * Generates sample verification documents for the task 14 tests and demo:
 *
 *   npm run samples:kyc
 *
 * Writes JPEGs to samples/kyc/. Every image is plainly fake: watermarked
 * "SAMPLE – NOT A REAL DOCUMENT" several times across it, issued by the
 * made-up "[Sample Health Authority]", for a made-up person, with no real
 * authority's name, logo, layout or security features. Never use real IDs
 * or licences in tests.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

export const KYC_SAMPLE_DIR = join('samples', 'kyc');
export const KYC_SAMPLE = {
  name: 'Dr. Sample Professional',
  licenceNumber: 'SAMPLE-LIC-12345',
  expiry: '2030-12-31',
} as const;

const WATERMARK = 'SAMPLE – NOT A REAL DOCUMENT';
const W = 1200;
const H = 760;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function watermark() {
  const rows = [0, 1, 2, 3, 4]
    .map(
      (i) =>
        `<text x="${-200 + i * 120}" y="${120 + i * 170}" transform="rotate(-18 ${W / 2} ${H / 2})" font-size="54" font-weight="800" fill="#C2410C" fill-opacity="0.28">${esc(WATERMARK)}</text>`,
    )
    .join('');
  return rows;
}

function card(title: string, lines: [string, string][], extra = '') {
  const body = lines
    .map(
      ([label, value], i) =>
        `<text x="380" y="${250 + i * 70}" font-size="26" fill="#5C5550">${esc(label)}</text><text x="380" y="${284 + i * 70}" font-size="34" font-weight="700" fill="#141414">${esc(value)}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">
    <rect width="${W}" height="${H}" fill="#FFF7F0"/>
    <rect x="30" y="30" width="${W - 60}" height="${H - 60}" rx="28" fill="#FFFFFF" stroke="#E7D7CA" stroke-width="4"/>
    <text x="70" y="110" font-size="40" font-weight="800" fill="#141414">${esc(title)}</text>
    <text x="70" y="160" font-size="26" fill="#5C5550">[Sample Health Authority]</text>
    <rect x="70" y="210" width="260" height="320" rx="16" fill="#EFE7E1"/>
    <circle cx="200" cy="320" r="70" fill="#BFAEA2"/><rect x="110" y="410" width="180" height="100" rx="50" fill="#BFAEA2"/>
    ${body}
    ${extra}
    ${watermark()}
    <text x="70" y="${H - 60}" font-size="24" font-weight="800" fill="#9A3412">${esc(WATERMARK)}</text>
  </svg>`;
}

const documents: { file: string; svg: string }[] = [
  {
    file: 'licence-sample.jpg',
    svg: card('Professional Licence (SAMPLE)', [
      ['Name', KYC_SAMPLE.name],
      ['Licence number', KYC_SAMPLE.licenceNumber],
      ['Profession', 'Genetic Counsellor'],
      ['Expiry', KYC_SAMPLE.expiry],
    ]),
  },
  {
    file: 'id-front-sample.jpg',
    svg: card('Identity Card (SAMPLE)', [
      ['Name', KYC_SAMPLE.name],
      ['Card number', '000-0000-0000000-0'],
      ['Expiry', '2031-01-01'],
    ]),
  },
  {
    file: 'id-back-sample.jpg',
    svg: card('Identity Card – back (SAMPLE)', [
      ['Issued by', '[Sample Health Authority]'],
      ['Machine-readable zone', 'SAMPLE<<NOT<<REAL<<<<<<<<<'],
    ]),
  },
  {
    file: 'selfie-sample.jpg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" font-family="Helvetica, Arial, sans-serif">
      <rect width="900" height="1200" fill="#E7DED6"/>
      <circle cx="450" cy="470" r="200" fill="#BFAEA2"/><rect x="200" y="720" width="500" height="480" rx="240" fill="#BFAEA2"/>
      <text x="80" y="120" font-size="48" font-weight="800" fill="#C2410C" fill-opacity="0.7">${esc(WATERMARK)}</text>
      <text x="80" y="1140" font-size="48" font-weight="800" fill="#C2410C" fill-opacity="0.7">${esc(WATERMARK)}</text>
    </svg>`,
  },
];

async function main() {
  mkdirSync(KYC_SAMPLE_DIR, { recursive: true });
  for (const doc of documents) {
    await sharp(Buffer.from(doc.svg)).jpeg({ quality: 88 }).toFile(join(KYC_SAMPLE_DIR, doc.file));
    console.log(`wrote ${join(KYC_SAMPLE_DIR, doc.file)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
