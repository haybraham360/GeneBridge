import { describe, expect, it } from 'vitest';
import { focusFor, followReasonFor, pathFor, type Followed } from './pathRules';

describe('user path', () => {
  it('is exploring without a claimed report and result with one', () => {
    expect(pathFor({ hasClaimedResult: false })).toBe('exploring');
    expect(pathFor({ hasClaimedResult: true })).toBe('result');
  });

  it('stays on the result path when someone with a result also follows conditions', () => {
    const followed: Followed[] = [{ conditionId: 'gjb2_hearing_loss', reason: 'family_history', createdAt: '2026-11-01' }];
    expect(pathFor({ hasClaimedResult: true })).toBe('result');
    expect(focusFor(followed, null)?.conditionId).toBe('gjb2_hearing_loss');
  });

  it('maps the onboarding reason to a follow reason', () => {
    expect(followReasonFor('family_condition')).toBe('family_history');
    expect(followReasonFor('think_condition')).toBe('think_i_have');
    expect(followReasonFor('just_learning')).toBe('learning');
    expect(followReasonFor(null)).toBe('learning');
  });

  it('focuses on the chosen condition if still followed, else the first', () => {
    const followed: Followed[] = [
      { conditionId: 'cystic_fibrosis', reason: 'learning', createdAt: '2026-11-01' },
      { conditionId: 'gjb2_hearing_loss', reason: 'family_history', createdAt: '2026-11-02' },
    ];
    expect(focusFor(followed, 'gjb2_hearing_loss')?.conditionId).toBe('gjb2_hearing_loss');
    expect(focusFor(followed, 'sickle_cell_disease')?.conditionId).toBe('cystic_fibrosis');
    expect(focusFor([], 'x')).toBeNull();
  });
});
