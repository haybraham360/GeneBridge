import { describe, expect, it } from 'vitest';
import { matchCondition, normaliseGene, similarity } from './match';

describe('catalogue matching', () => {
  it('matches by gene symbol when the gene belongs to one condition', () => {
    expect(matchCondition({ condition_text: 'Panel item 4', gene: 'SMN1' })).toMatchObject({ conditionId: 'spinal_muscular_atrophy', method: 'gene' });
    expect(matchCondition({ condition_text: 'Result', gene: 'gjb-2' })).toMatchObject({ conditionId: 'gjb2_hearing_loss' });
    expect(matchCondition({ condition_text: 'x', gene: 'HBA1/HBA2' })).toMatchObject({ conditionId: 'alpha_thalassemia' });
  });

  it('uses the name to settle a gene shared by two conditions (HBB)', () => {
    expect(matchCondition({ condition_text: 'Beta-thalassemia', gene: 'HBB' })).toMatchObject({ conditionId: 'beta_thalassemia', method: 'gene_name' });
    expect(matchCondition({ condition_text: 'Sickle cell disease', gene: 'HBB' })).toMatchObject({ conditionId: 'sickle_cell_disease', method: 'gene_name' });
    // HBB alone: either condition. Never guessed.
    expect(matchCondition({ condition_text: 'Haemoglobin gene', gene: 'HBB' })).toEqual({ conditionId: null, method: null, suggestion: null });
  });

  it('matches English names and lab synonyms', () => {
    expect(matchCondition({ condition_text: 'Nonsyndromic hearing loss (DFNB1)' }).conditionId).toBe('gjb2_hearing_loss');
    expect(matchCondition({ condition_text: 'Phenylalanine hydroxylase deficiency' }).conditionId).toBe('phenylketonuria');
    expect(matchCondition({ condition_text: 'β-thalassaemia trait' }).conditionId).toBe('beta_thalassemia');
    expect(matchCondition({ condition_text: 'Alpha-thalassemia' }).conditionId).toBe('alpha_thalassemia');
    expect(matchCondition({ condition_text: 'Glucose-6-phosphate dehydrogenase deficiency' }).conditionId).toBe('g6pd_deficiency');
  });

  it('matches Arabic names, with or without a joined prefix', () => {
    expect(matchCondition({ condition_text: 'التليف الكيسي' }).conditionId).toBe('cystic_fibrosis');
    expect(matchCondition({ condition_text: 'فقر الدم المنجلي' }).conditionId).toBe('sickle_cell_disease');
    expect(matchCondition({ condition_text: 'الثلاسيميا بيتا', gene: 'HBB' }).conditionId).toBe('beta_thalassemia');
    expect(matchCondition({ condition_text: 'ضمور العضلات الشوكي' }).conditionId).toBe('spinal_muscular_atrophy');
  });

  it('a name that contradicts the gene is only a suggestion', () => {
    expect(matchCondition({ condition_text: 'Cystic fibrosis', gene: 'SMN1' })).toEqual({ conditionId: null, method: null, suggestion: 'spinal_muscular_atrophy' });
  });

  it('fuzzy matching only suggests, never matches', () => {
    const misspelt = matchCondition({ condition_text: 'Cystic fibrosiss' });
    expect(misspelt.conditionId).toBeNull();
    expect(misspelt.suggestion).toBe('cystic_fibrosis');
  });

  it('a condition not in the catalogue is unmatched', () => {
    expect(matchCondition({ condition_text: 'Alport syndrome', gene: 'COL4A5' })).toEqual({ conditionId: null, method: null, suggestion: null });
  });

  it('helpers', () => {
    expect(normaliseGene(' smn-1 ')).toBe('SMN1');
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('', 'abc')).toBe(0);
  });
});
