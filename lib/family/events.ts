/**
 * Family map events (task 13, section 7). Counts and categories only:
 * never names, relations, conditions or any words the person said.
 */
export type FamilyEvent =
  | { name: 'family_describe_started'; props: { input: 'voice' | 'text'; locale: 'en' | 'ar' } }
  | {
      name: 'family_describe_completed';
      props: { people: number; links: number; conditions: number; questions: number; seconds: number };
    }
  | { name: 'family_changes_kept'; props: { people: number; links: number; conditions: number; mode: 'all' | 'one_by_one' } }
  | { name: 'family_changes_undone'; props: { people: number } }
  | { name: 'family_question_answered'; props: { kind: 'model' | 'condition_match' } }
  | { name: 'family_consanguinity_marked'; props?: undefined };

/** Events the browser may send through /api/family/event, with their allowed props. */
export const clientEvents = {
  family_changes_kept: { people: 'count', links: 'count', conditions: 'count', mode: ['all', 'one_by_one'] },
  family_changes_undone: { people: 'count' },
  family_question_answered: { kind: ['model', 'condition_match'] },
  family_consanguinity_marked: {},
} as const satisfies Record<string, Record<string, 'count' | readonly string[]>>;

export type ClientEventName = keyof typeof clientEvents;

/** Checks a browser event: known name, known props, small whole numbers or allowed values only. */
export function parseClientEvent(value: unknown): { name: ClientEventName; props: Record<string, string | number> } | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { name?: unknown; props?: unknown };
  if (typeof v.name !== 'string' || !Object.hasOwn(clientEvents, v.name)) return null;
  const name = v.name as ClientEventName;
  const spec = clientEvents[name] as Record<string, 'count' | readonly string[]>;
  const raw = v.props && typeof v.props === 'object' ? (v.props as Record<string, unknown>) : {};
  const props: Record<string, string | number> = {};
  for (const [key, rule] of Object.entries(spec)) {
    const x = raw[key];
    if (rule === 'count') {
      if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > 1000) return null;
      props[key] = x;
    } else {
      if (typeof x !== 'string' || !rule.includes(x)) return null;
      props[key] = x;
    }
  }
  if (Object.keys(raw).some((k) => !Object.hasOwn(spec, k))) return null;
  return { name, props };
}
