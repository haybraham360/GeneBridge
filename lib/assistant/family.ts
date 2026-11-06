/**
 * Family map shared into the chat (task 06, 1b point 3). Since task 13 the
 * map is stored owner-only (family_members); when the user presses "Share
 * my family map with this chat", the server builds this minimal snapshot
 * from it (lib/family/snapshot.ts): relations and statuses, never names
 * (guardrails 8 and 9).
 *
 * The demo snapshot mirrors Mariam's family in PROJECT.md section 10 and is
 * used by the assistant eval.
 */
import type { FamilyMember, FamilySnapshot } from './types';

export const demoFamilySnapshot: FamilySnapshot = {
  condition: 'sickle_cell_disease',
  pattern: 'autosomal_recessive',
  cousinUnion: true,
  members: [
    { relation: 'father', side: 'father', generation: -1, status: 'carrier' },
    { relation: 'mother', side: 'mother', generation: -1, status: 'not_sure' },
    { relation: 'uncle', side: 'father', generation: -1, status: 'known_condition' },
    { relation: 'brother', side: 'own', generation: 0, status: 'not_sure' },
    { relation: 'partner', side: 'partner', generation: 0, status: 'carrier' },
  ],
};

/** Relatives who may want to consider testing, in general terms. */
export function relativesToConsider(snapshot: FamilySnapshot): FamilyMember[] {
  return snapshot.members.filter((m) => m.status === 'not_sure' && m.side !== 'partner');
}

/** Sides of the family the condition is seen in. */
export function affectedSides(snapshot: FamilySnapshot): FamilyMember['side'][] {
  const sides = snapshot.members
    .filter((m) => m.status === 'known_condition' || m.status === 'carrier')
    .map((m) => m.side);
  return [...new Set(sides)];
}

/** Validates a snapshot sent from the browser. Rejects anything with names or extra fields. */
export function parseFamilySnapshot(value: unknown): FamilySnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const patterns = ['autosomal_recessive', 'autosomal_dominant', 'x_linked'];
  if (typeof v.condition !== 'string' || !/^[a-z0-9_]{2,40}$/.test(v.condition)) return null;
  if (typeof v.pattern !== 'string' || !patterns.includes(v.pattern)) return null;
  if (!Array.isArray(v.members) || v.members.length > 40) return null;
  const relations = /^[a-z_]{2,24}$/;
  const sides = ['mother', 'father', 'own', 'partner'];
  const statuses = ['known_condition', 'carrier', 'not_sure', 'none'];
  const members: FamilyMember[] = [];
  for (const m of v.members) {
    if (!m || typeof m !== 'object') return null;
    const r = m as Record<string, unknown>;
    if (typeof r.relation !== 'string' || !relations.test(r.relation)) return null;
    if (typeof r.side !== 'string' || !sides.includes(r.side)) return null;
    if (typeof r.status !== 'string' || !statuses.includes(r.status)) return null;
    const generation = r.generation === -1 || r.generation === 0 || r.generation === 1 ? r.generation : 0;
    members.push({
      relation: r.relation,
      side: r.side as FamilyMember['side'],
      generation,
      status: r.status as FamilyMember['status'],
    });
  }
  return {
    condition: v.condition,
    pattern: v.pattern as FamilySnapshot['pattern'],
    members,
    cousinUnion: v.cousinUnion === true,
  };
}
