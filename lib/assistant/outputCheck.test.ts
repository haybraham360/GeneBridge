import { describe, expect, it } from 'vitest';
import { calculateInheritance, numbersIn } from '@/lib/genetics/inheritance';
import { checkReply, statedChances } from './outputCheck';

const engine = numbersIn(calculateInheritance('autosomal_recessive', 'carrier', 'carrier'));

describe('checkReply', () => {
  it('passes a plain explanation with engine numbers', () => {
    const r = checkReply(
      'For each pregnancy there is a 25% chance the child has sickle cell disease and a 50% chance of a healthy carrier.',
      engine,
    );
    expect(r).toEqual({ ok: true, problems: [] });
  });

  it.each([
    ['You should do IVF.'],
    ['I recommend testing during pregnancy.'],
    ['IVF is the best option for you.'],
    ['This is the recommended path.'],
    ['أنصحك بإجراء الفحص.'],
    ['الخيار الأفضل هو أطفال الأنابيب.'],
  ])('catches directive wording: %s', (text) => {
    expect(checkReply(text, engine).problems).toContain('directive');
  });

  it('catches numbers the engine did not return', () => {
    expect(checkReply('There is a 30% chance for each pregnancy.', engine).problems).toContain(
      'unverified_number',
    );
    expect(checkReply('About 1 in 3 children will be affected.', engine).problems).toContain(
      'unverified_number',
    );
  });

  it('accepts engine numbers written another way', () => {
    expect(checkReply('That is 1 in 4 for each pregnancy.', engine).ok).toBe(true);
    expect(checkReply('احتمال ٢٥٪ في كل حمل.', engine).ok).toBe(true);
  });

  it('rejects any percentage when the engine was not called', () => {
    expect(checkReply('The chance is 25%.', []).problems).toContain('unverified_number');
  });

  it('catches diagnosis, marriage advice, rulings and dosing', () => {
    expect(checkReply('You have sickle cell disease.', []).problems).toContain('diagnosis');
    expect(checkReply("Don't get married.", []).problems).toContain('marriage_advice');
    expect(checkReply('It is haram to do this.', []).problems).toContain('religious_ruling');
    expect(checkReply('Take 5 mg of folic acid.', []).problems).toContain('medication');
    expect(checkReply('أنت مصاب بالمرض.', []).problems).toContain('diagnosis');
  });
});

describe('statedChances', () => {
  it('reads percentages and "N in M" in both languages', () => {
    expect(statedChances('25% and 1 in 2, ٥٠٪')).toEqual([25, 50, 50]);
  });
});
