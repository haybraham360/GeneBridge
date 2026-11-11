import { describe, expect, it } from 'vitest';
import type { RequestDetail } from '@/lib/pro/types';
import { briefInput, hasShared, rulePoints } from './brief';
import { blocking, briefPointsOk, checkSummary, parsePoints } from './check';

const notes = 'Both carriers of beta-thalassaemia. Explained 25% for each pregnancy. Referred for a confirmatory test.';

describe('checkSummary', () => {
  it('passes a plain summary that keeps the counsellor’s numbers', () => {
    const text =
      'You and your partner are both healthy carriers of beta-thalassaemia. For each pregnancy there is a 25% chance of a child with the condition. We arranged a confirmatory test for you.';
    expect(checkSummary(text, notes, 'en')).toEqual([]);
  });

  it('flags a chance the counsellor never gave', () => {
    expect(checkSummary('There is a 50% chance of a carrier child.', notes, 'en')).toEqual(['unverified_number']);
  });

  it.each([
    ['You should do IVF.', 'directive'],
    ['I recommend a test during pregnancy.', 'directive'],
    ["Don't get married.", 'marriage_advice'],
    ['Carriers are sick and need treatment.', 'carrier_not_healthy'],
    ['Take 5 mg of folic acid.', 'medication'],
  ] as const)('blocks "%s"', (text, problem) => {
    const problems = checkSummary(text, notes, 'en');
    expect(problems).toContain(problem);
    expect(blocking(problems)).toContain(problem);
  });

  it('asks the counsellor to check diagnosis wording, without blocking', () => {
    const problems = checkSummary('You have sickle cell disease.', notes, 'en');
    expect(problems).toEqual(['diagnosis']);
    expect(blocking(problems)).toEqual([]);
  });

  it('checks the patient’s language', () => {
    expect(checkSummary('You are a healthy carrier.', notes, 'ar')).toContain('wrong_language');
    expect(checkSummary('أنت تحمل صفة وراثية وأنت بصحة جيدة.', notes, 'ar')).toEqual([]);
    expect(checkSummary('أنت تحمل صفة وراثية وأنت بصحة جيدة.', notes, 'en')).toContain('wrong_language');
  });

  it('checks Arabic directive wording', () => {
    expect(checkSummary('ننصح بإجراء الفحص قبل الزواج.', notes, 'ar')).toContain('directive');
  });

  it('allows Arabic digits the counsellor gave in Western digits', () => {
    expect(checkSummary('في كل حمل، الاحتمال ٢٥٪ أن يولد طفل مصاب بالحالة.', notes, 'ar')).toEqual([]);
  });
});

describe('brief points', () => {
  it('parses bullet lines', () => {
    expect(parsePoints('- One point\n* Two\n3. Three\n\n')).toEqual(['One point', 'Two', 'Three']);
  });

  it('accepts neutral points', () => {
    expect(briefPointsOk(['Mariam asked how the test works.', 'The couple see biological children differently.'], 'en')).toBe(true);
  });

  it.each([
    [['There is a 25% chance for each pregnancy.']],
    [['There is a 1 in 4 chance.']],
    [['I recommend discussing IVF first.']],
    [['They should not marry.']],
    [['The couple are not compatible.']],
    [['يجب أن يفكرا في الخيارات.']],
    [[]],
  ])('rejects %j', (points) => {
    expect(briefPointsOk(points, 'en')).toBe(false);
  });
});

const detail = (overrides: Partial<RequestDetail> = {}): RequestDetail => ({
  id: '00000000-0000-0000-0000-000000000001',
  source: 'booking',
  reason: 'couple_session',
  urgency: 'standard',
  status: 'booked',
  createdAt: '2026-11-10T10:00:00Z',
  isCouple: true,
  booking: null,
  people: [
    {
      role: 'user',
      label: { firstName: 'Mariam', initial: 'M' },
      locale: 'ar',
      sharedAny: true,
      result: {
        level: 'summary',
        conditionCode: 'beta_thalassemia',
        conditionNames: null,
        status: 'carrier',
        genotype: 'HBB',
        flagged: false,
        flagReason: null,
        reportedAt: null,
        understood: 1,
        centre: null,
      },
      valuesShared: true,
      questions: ['Can we still have children?'],
      aiSummary: null,
      familyMapShared: false,
      missing: [],
      pending: [],
    },
    {
      role: 'partner',
      label: { firstName: 'Khalid', initial: 'K' },
      locale: 'en',
      sharedAny: true,
      result: {
        level: 'summary',
        conditionCode: 'unknown_variant',
        conditionNames: null,
        status: 'uncertain',
        genotype: 'c.123A>G',
        flagged: true,
        flagReason: 'vus',
        reportedAt: null,
        understood: 0,
        centre: null,
      },
      valuesShared: true,
      questions: null,
      aiSummary: null,
      familyMapShared: false,
      missing: [],
      pending: [],
    },
  ],
  values: [
    { questionId: 'biological_children', userBand: 'very_important', partnerBand: 'less_important', agreement: 'differ' },
    { questionId: 'cost', userBand: 'important', partnerBand: 'important', agreement: 'important' },
  ],
  requestSummary: null,
  note: null,
  referrals: [],
  ...overrides,
});

const labels = {
  person: (p: RequestDetail['people'][number]) => p.label.firstName ?? 'Patient',
  resultLine: (p: RequestDetail['people'][number]) => `${p.result?.status} ${p.result?.conditionCode} ${p.result?.genotype}`,
  valueTopic: (q: string) => q,
};

describe('briefInput', () => {
  it('never sends a flagged result’s condition, status or genotype', () => {
    const input = briefInput(detail(), labels);
    const json = JSON.stringify(input);
    expect(input.people[1].finding).toEqual({ flagged: true, reason: 'vus' });
    expect(input.people[1].understood).toBeNull();
    expect(json).not.toContain('unknown_variant');
    expect(json).not.toContain('c.123A>G');
    expect(json).not.toContain('uncertain');
  });

  it('keeps only the values the couple see differently', () => {
    expect(briefInput(detail(), labels).valuesDiffer).toEqual(['biological_children']);
  });

  it('builds rule-based points, flagged first', () => {
    const points = rulePoints(briefInput(detail(), labels), (items) => items.join(', '));
    expect(points.map((p) => p.key)).toEqual(['flagged', 'understanding', 'questions', 'valuesDiffer']);
    expect(points[0].values).toEqual({ name: 'Khalid' });
  });

  it('says when nothing was shared', () => {
    const empty = detail({
      isCouple: false,
      values: [],
      people: [{ ...detail().people[0], result: null, questions: null, valuesShared: false, sharedAny: false }],
    });
    const input = briefInput(empty, labels);
    expect(hasShared(input)).toBe(false);
    expect(rulePoints(input, (i) => i.join(', ')).map((p) => p.key)).toEqual(['nothingShared']);
  });
});
