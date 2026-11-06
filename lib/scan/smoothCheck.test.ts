import { describe, expect, it } from 'vitest';
import { checkSmoothed } from './smoothCheck';

const original = [
  'You carry one changed copy of the HBB gene, which is linked to Beta-thalassaemia.',
  'A carrier result is not a diagnosis. Carriers are healthy.',
  'It matters for children only if a partner carries a change in the same gene.',
];

describe('the output check for smoothed wording', () => {
  it('accepts a light rewording', () => {
    const smoothed = [
      'You carry one changed copy of the HBB gene, which is linked to Beta-thalassaemia.',
      'A carrier result is not a diagnosis: carriers are healthy.',
      'This matters for children only if a partner carries a change in the same gene.',
    ];
    expect(checkSmoothed(original, smoothed)).toEqual({ ok: true, problems: [] });
  });

  it('blocks an invented risk number', () => {
    const smoothed = [...original.slice(0, 2), 'If your partner is also a carrier, each child has a 25% chance of being affected.'];
    expect(checkSmoothed(original, smoothed).problems).toEqual(expect.arrayContaining(['new_number']));
  });

  it('blocks an invented gene', () => {
    const smoothed = [original[0].replace('Beta-thalassaemia', 'Beta-thalassaemia and HBA2'), ...original.slice(1)];
    expect(checkSmoothed(original, smoothed).problems).toContain('new_gene');
  });

  it('blocks a new condition', () => {
    const smoothed = [...original.slice(0, 2), 'It is also linked to sickle cell disease in the same gene.'];
    expect(checkSmoothed(original, smoothed).problems).toContain('new_condition');
  });

  it('blocks directive and diagnosis language', () => {
    expect(checkSmoothed(original, [...original.slice(0, 2), 'You should get your partner tested before you marry.']).problems).toContain('reply_check');
    expect(checkSmoothed(original, ['You are affected by Beta-thalassaemia.', ...original.slice(1)]).problems).toContain('reply_check');
  });

  it('blocks new facts added as extra words', () => {
    const smoothed = [
      original[0],
      original[1],
      'Treatment usually involves regular transfusions, iron chelation therapy and bone marrow transplants at specialist haematology centres.',
    ];
    const { ok, problems } = checkSmoothed(original, smoothed);
    expect(ok).toBe(false);
    expect(problems).toEqual(expect.arrayContaining(['new_words']));
  });

  it('keeps captions aligned: same number of sentences', () => {
    expect(checkSmoothed(original, original.slice(0, 2)).problems).toContain('sentence_count');
  });

  it('works in Arabic', () => {
    const ar = ['تحمل نسخة متغيّرة واحدة من جين HBB.', 'حاملو الصفة أصحّاء.'];
    expect(checkSmoothed(ar, ar).ok).toBe(true);
    expect(checkSmoothed(ar, ['تحمل نسخة متغيّرة واحدة من جين HBB.', 'احتمال الإصابة ٢٥٪ لكل حمل.']).problems).toContain('new_number');
  });
});
