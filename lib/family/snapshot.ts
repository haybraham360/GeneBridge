/**
 * What Ask GeneBridge receives when the person turns on "Use my family map"
 * (task 06, task 13 section 1): relations, sides, generations and statuses
 * for one condition. Never labels, names or "Other" words. Any explanation
 * of chances still comes from the inheritance engine, in the assistant.
 */
import type { FamilyMember, FamilySnapshot } from '@/lib/assistant/types';
import { relationLabelKey } from './relations';
import type { Tree } from './types';

type Pattern = FamilySnapshot['pattern'];

export function familySnapshot(tree: Tree, patternOf: (conditionId: string) => Pattern | null): FamilySnapshot | null {
  // The catalogue condition seen most often in the family.
  const counts = new Map<string, number>();
  for (const c of tree.conditions) if (c.conditionId) counts.set(c.conditionId, (counts.get(c.conditionId) ?? 0) + 1);
  const condition = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!condition) return null;
  const pattern = patternOf(condition);
  if (!pattern) return null;

  const partnerRelations = new Set(['husband', 'wife', 'partner']);
  const members: FamilyMember[] = tree.members
    .filter((m) => !m.isOwner && !m.placeholder)
    .slice(0, 40)
    .map((m) => {
      const row = tree.conditions.find((c) => c.memberId === m.id && c.conditionId === condition);
      return {
        relation: relationLabelKey(m.relation, 'none', m.sex).slice(0, 24),
        side: partnerRelations.has(m.relation)
          ? 'partner'
          : m.side === 'paternal' || m.relation === 'father'
            ? 'father'
            : m.side === 'maternal' || m.relation === 'mother'
              ? 'mother'
              : 'own',
        generation: m.generation < 0 ? -1 : m.generation > 0 ? 1 : 0,
        status: !row ? 'none' : row.status === 'known' ? 'known_condition' : row.status === 'carrier' ? 'carrier' : 'not_sure',
      };
    });
  return { condition, pattern, members, cousinUnion: tree.links.some((l) => l.type === 'partner_of' && l.consanguineous) };
}
