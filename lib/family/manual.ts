/**
 * Editing the family map by hand ("Add a relative", "Edit", "Remove"). The
 * person picks "This person is the <relation> of <someone on the map>"; the
 * relation to the owner, side and generation are worked out from the tree.
 */
import { childrenOf, memberMap, parentsOf, partnersOf, removeMember } from './graph';
import { markConsanguinity, relationFromTree } from './kinship';
import type { Relation } from './relations';
import type { ConditionStatus, Member, MemberCondition, Sex, Tree } from './types';
import { validateTree } from './validate';

export const manualRelations = ['father', 'mother', 'parent', 'brother', 'sister', 'sibling', 'son', 'daughter', 'child', 'husband', 'wife', 'partner'] as const;
export type ManualRelation = (typeof manualRelations)[number];

const kindOf: Record<ManualRelation, 'parent' | 'sibling' | 'child' | 'partner'> = {
  father: 'parent', mother: 'parent', parent: 'parent',
  brother: 'sibling', sister: 'sibling', sibling: 'sibling',
  son: 'child', daughter: 'child', child: 'child',
  husband: 'partner', wife: 'partner', partner: 'partner',
};
const sexOf: Record<ManualRelation, Sex> = {
  father: 'male', mother: 'female', parent: 'unknown', brother: 'male', sister: 'female', sibling: 'unknown',
  son: 'male', daughter: 'female', child: 'unknown', husband: 'male', wife: 'female', partner: 'unknown',
};

export type ConditionInput = { conditionId: string | null; otherText: string | null; status: ConditionStatus } | null;

export type ManualError = 'noTarget' | 'twoParents' | 'twoPartners' | 'invalid';

export type NewRelative = {
  label: string;
  relation: ManualRelation;
  targetId: string;
  consanguineous: boolean;
  condition: ConditionInput;
};

/** Recomputes each person's relation to the owner and side from the tree, where the tree can tell. */
export function refreshRelations(tree: Tree): Tree {
  return {
    ...tree,
    members: tree.members.map((m) => {
      if (m.isOwner) return m;
      const found = relationFromTree(tree, m.id);
      if (!found) return m;
      // Keep a more precise word ("uncle" over "uncle_or_aunt") when it says the same thing.
      const generic: Partial<Record<Relation, Relation[]>> = {
        parent: ['father', 'mother'],
        sibling: ['brother', 'sister'],
        child: ['son', 'daughter'],
        partner: ['husband', 'wife'],
        grandparent: ['grandfather', 'grandmother'],
        uncle_or_aunt: ['uncle', 'aunt'],
        sibling_child: ['nephew', 'niece'],
        grandchild: ['grandson', 'granddaughter'],
        partner_parent: ['partner_father', 'partner_mother'],
      };
      const relation = generic[found.relation]?.includes(m.relation as Relation) ? m.relation : found.relation;
      return { ...m, relation, side: found.side === 'none' && m.side !== 'none' && relation === m.relation ? m.side : found.side };
    }),
  };
}

function finish(tree: Tree): { tree: Tree } | { error: ManualError } {
  const next = markConsanguinity(refreshRelations(tree)).tree;
  return validateTree(next).length ? { error: 'invalid' } : { tree: next };
}

export function addRelative(tree: Tree, input: NewRelative, uuid: () => string): { tree: Tree; id: string } | { error: ManualError } {
  const target = memberMap(tree).get(input.targetId);
  if (!target) return { error: 'noTarget' };
  const kind = kindOf[input.relation];
  const member: Member = {
    id: uuid(),
    label: input.label.trim().slice(0, 60) || null,
    relation: 'relative',
    side: 'none',
    sex: sexOf[input.relation],
    generation: target.generation + (kind === 'parent' ? -1 : kind === 'child' ? 1 : 0),
    deceased: false,
    createdBy: 'manual',
    isOwner: false,
    placeholder: false,
  };
  let next: Tree = { ...tree, members: [...tree.members, member] };
  const link = (from: string, to: string, type: 'parent_of' | 'partner_of', consanguineous = false) => {
    next = { ...next, links: [...next.links, { id: uuid(), from, to, type, consanguineous }] };
  };

  switch (kind) {
    case 'parent':
      if (parentsOf(tree, target.id).length >= 2) return { error: 'twoParents' };
      link(member.id, target.id, 'parent_of');
      break;
    case 'child': {
      link(target.id, member.id, 'parent_of');
      const partners = partnersOf(tree, target.id);
      if (partners.length === 1) link(partners[0], member.id, 'parent_of');
      break;
    }
    case 'partner':
      if (partnersOf(tree, target.id).length >= 2) return { error: 'twoPartners' };
      link(target.id, member.id, 'partner_of', input.consanguineous);
      break;
    case 'sibling': {
      let parents = parentsOf(tree, target.id);
      if (!parents.length) {
        // An unknown parent connects the two siblings.
        const ph: Member = { ...member, id: uuid(), label: null, sex: 'unknown', generation: target.generation - 1, placeholder: true };
        next = { ...next, members: [...next.members, ph] };
        link(ph.id, target.id, 'parent_of');
        parents = [ph.id];
      }
      for (const p of parents) link(p, member.id, 'parent_of');
      break;
    }
  }
  if (input.condition) next = setCondition(next, member.id, input.condition, uuid);
  const done = finish(next);
  return 'error' in done ? done : { tree: done.tree, id: member.id };
}

/** Sets a person's main condition by hand (replaces their first condition, or adds one). Null removes all. */
export function setCondition(tree: Tree, memberId: string, condition: ConditionInput, uuid: () => string): Tree {
  const others = tree.conditions.filter((c) => c.memberId !== memberId);
  if (!condition) return { ...tree, conditions: others };
  const mine = tree.conditions.filter((c) => c.memberId === memberId);
  const row: MemberCondition = {
    id: mine[0]?.id ?? uuid(),
    memberId,
    conditionId: condition.conditionId,
    otherText: condition.conditionId ? null : (condition.otherText?.trim().slice(0, 120) || null),
    status: condition.status,
    source: 'manual',
  };
  if (!row.conditionId && !row.otherText) return { ...tree, conditions: [...others, ...mine.slice(1)] };
  return { ...tree, conditions: [...others, row, ...mine.slice(1)] };
}

export function editMember(
  tree: Tree,
  id: string,
  patch: { label: string; deceased: boolean; condition: ConditionInput },
  uuid: () => string,
): { tree: Tree } | { error: ManualError } {
  let next: Tree = {
    ...tree,
    members: tree.members.map((m) => (m.id === id ? { ...m, label: patch.label.trim().slice(0, 60) || null, deceased: patch.deceased, placeholder: false } : m)),
  };
  next = setCondition(next, id, patch.condition, uuid);
  return finish(next);
}

export function removeRelative(tree: Tree, id: string): { tree: Tree } | { error: ManualError } {
  const m = memberMap(tree).get(id);
  if (!m || m.isOwner) return { error: 'noTarget' };
  let next = removeMember(tree, id);
  // Unknown connectors left connecting nobody go too.
  for (;;) {
    const orphan = next.members.find((x) => x.placeholder && childrenOf(next, x.id).length + parentsOf(next, x.id).length + partnersOf(next, x.id).length < 2);
    if (!orphan) break;
    next = removeMember(next, orphan.id);
  }
  return finish(next);
}
