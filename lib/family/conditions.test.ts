import { describe, expect, it } from 'vitest';
import { hedgedStatus, matchFamilyCondition, stripVariantDetails } from './conditions';

describe('family condition matching', () => {
  it('matches catalogue names and synonyms in English', () => {
    expect(matchFamilyCondition('beta-thalassemia major').conditionId).toBe('beta_thalassemia');
    expect(matchFamilyCondition('CF').conditionId).toBe('cystic_fibrosis');
    expect(matchFamilyCondition('sickle cell trait').conditionId).toBe('sickle_cell_disease');
    expect(matchFamilyCondition('SMA').conditionId).toBe('spinal_muscular_atrophy');
  });

  it('matches catalogue names and synonyms in Arabic', () => {
    expect(matchFamilyCondition('ثلاسيميا').conditionId).toBe('beta_thalassemia');
    expect(matchFamilyCondition('فقر الدم المنجلي').conditionId).toBe('sickle_cell_disease');
    expect(matchFamilyCondition('التليف الكيسي').conditionId).toBe('cystic_fibrosis');
  });

  it('only suggests for everyday words, never matches', () => {
    const hearing = matchFamilyCondition('hearing problems');
    expect(hearing.conditionId).toBeNull();
    expect(hearing.candidates).toEqual(['gjb2_hearing_loss']);
    expect(matchFamilyCondition('مشاكل في السمع')).toMatchObject({ conditionId: null, candidates: ['gjb2_hearing_loss'] });

    const anaemia = matchFamilyCondition('anaemia from birth that needed transfusions');
    expect(anaemia.conditionId).toBeNull();
    expect(anaemia.candidates).toContain('beta_thalassemia');

    // Vague: several possibilities, still nothing assumed.
    const blood = matchFamilyCondition('a blood problem');
    expect(blood.conditionId).toBeNull();
    expect(blood.candidates.length).toBeGreaterThan(1);
  });

  it('leaves unknown words as "Other" with no suggestion', () => {
    expect(matchFamilyCondition('bad migraines')).toEqual({ conditionId: null, candidates: [], words: 'bad migraines' });
  });

  it('strips variant details from a relative\'s test result', () => {
    const cleaned = stripVariantDetails('beta-thalassemia, HBB c.92+1G>A heterozygous (pathogenic)');
    expect(cleaned).not.toMatch(/c\.92|heterozygous|pathogenic/i);
    expect(matchFamilyCondition('HBB c.20A>T p.Glu7Val sickle cell').words).not.toMatch(/c\.20|p\.Glu/);
  });

  it('turns "maybe / I think / not sure" into not sure', () => {
    expect(hedgedStatus('I think he has CF', 'known')).toBe('not_sure');
    expect(hedgedStatus('يمكن عنده ثلاسيميا', 'known')).toBe('not_sure');
    expect(hedgedStatus('has CF', 'known')).toBe('known');
  });
});
