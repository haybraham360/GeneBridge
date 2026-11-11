/**
 * What a Blind Match screen can show (task 17), parsed from the database
 * functions. Nothing here ever carries a result: only the answer, the
 * conditions both were screened for, and a condition name after a mutual
 * reveal.
 */
export type Eligibility = 'ok' | 'flagged' | 'no_result' | 'unverified' | 'limit';
export type Outcome = 'shared' | 'none' | 'not_comparable';
export type SessionStatus = 'waiting' | 'joined' | 'resolved' | 'cancelled' | 'gone';

export type MatchState = {
  status: SessionStatus;
  role: 'starter' | 'joiner' | null;
  otherLabel: string | null;
  meAgreed: boolean;
  otherAgreed: boolean;
  outcome: Outcome | null;
  screenedCodes: string[];
  meRevealed: boolean;
  /** Only once both tapped "Show us which condition". */
  revealedCodes: string[] | null;
};

export type HistoryItem = { id: string; resolvedAt: string; otherLabel: string | null; outcome: Outcome; screenedCount: number };

const eligibilities: Eligibility[] = ['ok', 'flagged', 'no_result', 'unverified', 'limit'];
const statuses: SessionStatus[] = ['waiting', 'joined', 'resolved', 'cancelled', 'gone'];
const outcomes: Outcome[] = ['shared', 'none', 'not_comparable'];

export function parseEligibility(value: unknown): Eligibility {
  return eligibilities.includes(value as Eligibility) ? (value as Eligibility) : 'no_result';
}

export function parseOutcome(value: unknown): Outcome | null {
  return outcomes.includes(value as Outcome) ? (value as Outcome) : null;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

export const goneState: MatchState = {
  status: 'gone',
  role: null,
  otherLabel: null,
  meAgreed: false,
  otherAgreed: false,
  outcome: null,
  screenedCodes: [],
  meRevealed: false,
  revealedCodes: null,
};

export function parseState(raw: unknown): MatchState {
  if (!raw || typeof raw !== 'object') return goneState;
  const r = raw as Record<string, unknown>;
  const status = statuses.includes(r.status as SessionStatus) ? (r.status as SessionStatus) : 'gone';
  if (status === 'gone') return goneState;
  return {
    status,
    role: r.role === 'starter' || r.role === 'joiner' ? r.role : null,
    otherLabel: typeof r.other_label === 'string' && r.other_label.trim() ? r.other_label.trim() : null,
    meAgreed: r.me_agreed === true,
    otherAgreed: r.other_agreed === true,
    outcome: parseOutcome(r.outcome),
    screenedCodes: strings(r.screened_codes),
    meRevealed: r.me_revealed === true,
    revealedCodes: Array.isArray(r.revealed_codes) ? strings(r.revealed_codes) : null,
  };
}
