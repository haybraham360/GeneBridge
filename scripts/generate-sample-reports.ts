/**
 * Generates the demo sample reports (task 12, section 7):
 *
 *   npm run samples:generate
 *
 * Writes PDFs and photo-style JPGs to samples/reports/. Every report is
 * clearly fake: watermarked "SAMPLE – NOT A REAL REPORT" across the page,
 * from the made-up "[Sample Genomics Lab]", with made-up people and numbers,
 * and no real lab's name, logo or layout. Contents come from
 * lib/scan/samples.ts, which the eval also uses.
 *
 * Uses Playwright with the installed Google Chrome (PW_CHANNEL=chrome, the
 * default) or Playwright's own Chromium (PW_CHANNEL=chromium).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { SAMPLE_DIR, SAMPLE_LAB, samples, WATERMARK, type Sample } from '../lib/scan/samples';

const labels = {
  en: {
    patient: 'Patient',
    id: 'ID number',
    dob: 'Date of birth',
    date: 'Report date',
    panel: 'Panel',
    condition: 'Condition',
    gene: 'Gene',
    variant: 'Variant',
    zygosity: 'Zygosity',
    classification: 'Classification',
    result: 'Result',
    reviewed: 'Reviewed by: [Sample Clinical Geneticist]',
    note: 'Carrier screening detects common variants only. A negative result reduces but does not remove the chance of being a carrier.',
    notes: 'Notes',
    method: 'Method: targeted variant analysis and copy-number analysis.',
  },
  ar: {
    patient: 'الاسم',
    id: 'رقم الهوية',
    dob: 'تاريخ الميلاد',
    date: 'تاريخ التقرير',
    panel: 'اللوحة',
    condition: 'الحالة',
    gene: 'الجين',
    variant: 'المتغيّر',
    zygosity: 'الزيجوت',
    classification: 'التصنيف',
    result: 'النتيجة',
    reviewed: 'راجعه: [اختصاصي وراثة سريرية – عيّنة]',
    note: 'يكشف فحص حمل الصفات المتغيّرات الشائعة فقط. النتيجة السلبية تقلّل احتمال حمل الصفة لكنها لا تلغيه.',
    notes: 'ملاحظات',
    method: 'الطريقة: تحليل متغيّرات محدّدة وتحليل عدد النسخ.',
  },
} as const;

const zygosityText = {
  en: { heterozygous: 'Heterozygous', homozygous: 'Homozygous', hemizygous: 'Hemizygous', unknown: '' },
  ar: { heterozygous: 'متغاير الزيجوت', homozygous: 'متماثل الزيجوت', hemizygous: 'نصف زيجوت', unknown: '' },
} as const;
const classText = {
  en: { pathogenic: 'Pathogenic', likely_pathogenic: 'Likely pathogenic', uncertain: 'Uncertain significance', likely_benign: 'Likely benign', benign: 'Benign', unknown: '' },
  ar: { pathogenic: 'مُمرِض', likely_pathogenic: 'مُمرِض على الأرجح', uncertain: 'غير مؤكد الأهمية', likely_benign: 'حميد على الأرجح', benign: 'حميد', unknown: '' },
} as const;

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

function reportHtml(sample: Sample): string {
  const l = labels[sample.language];
  const dir = sample.language === 'ar' ? 'rtl' : 'ltr';
  const rows = sample.rows
    .map(
      (r) => `<tr>
        <td>${escape(r.condition)}</td>
        <td class="ltr">${escape(r.gene)}</td>
        <td class="ltr">${escape(r.variant ?? '—')}</td>
        <td>${zygosityText[sample.language][r.zygosity ?? 'unknown'] || '—'}</td>
        <td>${classText[sample.language][r.classification ?? 'unknown'] || '—'}</td>
        <td class="${r.reported === 'not_detected' ? '' : 'strong'}">${escape(r.resultText)}</td>
      </tr>`,
    )
    .join('');
  return `
  <div class="page" dir="${dir}" lang="${sample.language}">
    <div class="watermark" aria-hidden="true">${WATERMARK}</div>
    <div class="banner">${WATERMARK}</div>
    <header>
      <div class="lab"><div class="mark"></div>${escape(SAMPLE_LAB)}</div>
      <div class="addr ltr">[Sample address] · [Sample phone]</div>
    </header>
    <h1>${escape(sample.title)}</h1>
    <table class="details">
      <tr><th>${l.patient}</th><td>${escape(sample.patient.name)}</td><th>${l.date}</th><td class="ltr">${sample.reportDate}</td></tr>
      <tr><th>${l.id}</th><td class="ltr">${sample.patient.idNumber}</td><th>${l.dob}</th><td class="ltr">${sample.patient.dob}</td></tr>
      <tr><th>${l.panel}</th><td colspan="3">${escape(sample.panel)}</td></tr>
    </table>
    <table class="results">
      <thead><tr><th>${l.condition}</th><th>${l.gene}</th><th>${l.variant}</th><th>${l.zygosity}</th><th>${l.classification}</th><th>${l.result}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <h2>${l.notes}</h2>
    <p>${l.method}</p>
    <p>${l.note}</p>
    ${sample.injection ? `<p class="injection">${escape(sample.injection)}</p>` : ''}
    <footer>
      <p>${l.reviewed}</p>
      <p class="ltr">${WATERMARK} · ${escape(SAMPLE_LAB)}</p>
    </footer>
  </div>`;
}

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Helvetica, Arial, "Geeza Pro", "Noto Naskh Arabic", sans-serif; color: #1d1d1f; }
  .page { position: relative; width: 794px; min-height: 1123px; padding: 56px 56px 48px; background: #fff; overflow: hidden; }
  .ltr { direction: ltr; unicode-bidi: isolate; }
  .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 64px; font-weight: 800;
    color: rgba(200, 30, 30, 0.13); transform: rotate(-32deg); white-space: nowrap; pointer-events: none; direction: ltr; }
  .banner { background: #b91c1c; color: #fff; font-weight: 800; text-align: center; padding: 6px; margin: -56px -56px 28px; letter-spacing: 0.08em; direction: ltr; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2f4f6f; padding-bottom: 12px; }
  .lab { display: flex; gap: 10px; align-items: center; font-size: 22px; font-weight: 800; color: #2f4f6f; }
  .mark { width: 28px; height: 28px; border: 4px solid #2f4f6f; border-radius: 50%; }
  .addr { font-size: 12px; color: #555; }
  h1 { font-size: 22px; margin: 22px 0 14px; }
  h2 { font-size: 15px; margin: 22px 0 6px; }
  p { font-size: 13px; line-height: 1.5; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .details th { text-align: start; color: #555; font-weight: 600; width: 18%; padding: 4px 6px; }
  .details td { padding: 4px 6px; font-weight: 600; }
  .results { margin-top: 18px; }
  .results th { background: #e8eef4; text-align: start; padding: 8px 6px; font-size: 12px; }
  .results td { border-bottom: 1px solid #dde3ea; padding: 9px 6px; vertical-align: top; }
  .strong { font-weight: 800; }
  .injection { font-size: 12px; color: #333; border: 1px dashed #999; padding: 6px; }
  footer { position: absolute; inset-inline: 56px; bottom: 40px; border-top: 1px solid #ccd; padding-top: 8px; font-size: 12px; color: #555; }
`;

/** A phone photo of the printed page: on a desk, angled or blurred. */
function photoHtml(sample: Sample): string {
  const style =
    sample.photo === 'angled'
      ? 'transform: perspective(1600px) rotateX(9deg) rotateZ(-5deg) scale(0.92);'
      : sample.photo === 'blurry'
        ? 'transform: rotateZ(3deg) scale(0.9); filter: blur(7px) brightness(0.8);'
        : 'transform: rotateZ(-1.2deg) scale(0.94);';
  return `<html><head><meta charset="utf-8"><style>${css}
    body { width: 1000px; height: 1300px; display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle at 30% 20%, #8a6a4f, #4d3726 70%); }
    .page { box-shadow: 0 30px 60px rgba(0,0,0,0.45); ${style} }
  </style></head><body>${reportHtml(sample)}</body></html>`;
}

function pdfHtml(sample: Sample): string {
  return `<html><head><meta charset="utf-8"><style>${css} @page { size: A4; margin: 0; } .page { width: 210mm; min-height: 297mm; }</style></head><body>${reportHtml(sample)}</body></html>`;
}

async function main() {
  mkdirSync(SAMPLE_DIR, { recursive: true });
  const channel = process.env.PW_CHANNEL ?? 'chrome';
  const browser = await chromium.launch(channel === 'chromium' ? {} : { channel });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
    for (const sample of samples) {
      const out = join(SAMPLE_DIR, sample.file);
      if (sample.format === 'pdf') {
        await page.setContent(pdfHtml(sample), { waitUntil: 'load' });
        await page.pdf({ path: out, format: 'A4', printBackground: true });
      } else {
        await page.setContent(photoHtml(sample), { waitUntil: 'load' });
        await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
      }
      console.log(`wrote ${out}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
