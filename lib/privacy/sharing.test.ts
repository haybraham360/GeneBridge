import { describe, expect, it } from 'vitest';
import { consentHistory, liveGrantees, type ConsentRow, type GrantRow } from './sharing';

const grant = (over: Partial<GrantRow>): GrantRow => ({
  id: 'g',
  grantee_id: 'pro-1',
  grantee_name: 'Dr. Example',
  grantee_role: 'professional',
  resource: 'result',
  level: 'summary',
  granted_at: '2026-11-01T10:00:00Z',
  revoked_at: null,
  ...over,
});

describe('liveGrantees', () => {
  it('is empty for a new account', () => {
    expect(liveGrantees([])).toEqual([]);
  });

  it('groups live grants per person, result first, and skips revoked ones', () => {
    const rows = [
      grant({ id: 'a', resource: 'values_summary', granted_at: '2026-11-02T10:00:00Z' }),
      grant({ id: 'b', resource: 'result', granted_at: '2026-11-03T10:00:00Z' }),
      grant({ id: 'c', resource: 'family_map', revoked_at: '2026-11-04T10:00:00Z' }),
      grant({ id: 'd', grantee_id: 'pro-2', grantee_name: '  ', granted_at: '2026-11-05T10:00:00Z' }),
    ];
    const result = liveGrantees(rows);
    expect(result.map((g) => g.granteeId)).toEqual(['pro-2', 'pro-1']);
    expect(result[1].resources.map((r) => r.resource)).toEqual(['result', 'values_summary']);
    expect(result[1].since).toBe('2026-11-02T10:00:00Z');
    expect(result[0].name).toBeNull();
  });
});

describe('consentHistory', () => {
  const terms: ConsentRow = { kind: 'terms', scope: null, granted_at: '2026-10-27T09:00:00Z', revoked_at: null };

  it('lists terms, sharing and stopping, newest first', () => {
    const items = consentHistory([terms], [grant({ revoked_at: '2026-11-04T10:00:00Z' })]);
    expect(items.map((i) => i.kind)).toEqual(['stopped', 'shared', 'terms']);
  });

  it('treats a couple level change as a change, not a withdrawal', () => {
    const consents: ConsentRow[] = [
      { kind: 'couple_view', scope: 'summary', granted_at: '2026-10-30T10:00:00Z', revoked_at: '2026-11-01T10:00:00.500Z' },
      { kind: 'couple_view', scope: 'full', granted_at: '2026-11-01T10:00:01Z', revoked_at: null },
    ];
    expect(consentHistory(consents, []).map((i) => i.kind)).toEqual(['couple_agreed', 'couple_agreed']);
  });

  it('shows a real withdrawal', () => {
    const consents: ConsentRow[] = [
      { kind: 'couple_view', scope: 'shared_only', granted_at: '2026-10-30T10:00:00Z', revoked_at: '2026-11-02T10:00:00Z' },
    ];
    expect(consentHistory(consents, []).map((i) => i.kind)).toEqual(['couple_withdrawn', 'couple_agreed']);
  });
});
