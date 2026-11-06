/**
 * Graph rules for the family map (task 13, section 3). Any change, by hand
 * or proposed by the AI, must leave the tree valid:
 *   - exactly one owner node;
 *   - at most 2 parents per person;
 *   - no cycles (nobody is their own ancestor);
 *   - consistent generations (a parent is one generation above their child,
 *     partners are in the same generation);
 *   - links point at people on the map, no duplicates, no self-links;
 *   - at most MAX_PEOPLE people.
 */
import { MAX_PEOPLE, type Tree } from './types';

export type GraphProblem =
  | { code: 'owner_count'; count: number }
  | { code: 'too_many_people'; count: number }
  | { code: 'too_many_parents'; member: string }
  | { code: 'cycle'; member: string }
  | { code: 'generation_parent'; link: string }
  | { code: 'generation_partner'; link: string }
  | { code: 'missing_member'; link: string }
  | { code: 'self_link'; link: string }
  | { code: 'duplicate_link'; link: string }
  | { code: 'consanguineous_not_partner'; link: string }
  | { code: 'condition_member'; condition: string };

export function validateTree(tree: Tree): GraphProblem[] {
  const problems: GraphProblem[] = [];
  const ids = new Set(tree.members.map((m) => m.id));
  const generation = new Map(tree.members.map((m) => [m.id, m.generation]));

  const owners = tree.members.filter((m) => m.isOwner).length;
  if (owners !== 1) problems.push({ code: 'owner_count', count: owners });
  if (tree.members.length > MAX_PEOPLE) problems.push({ code: 'too_many_people', count: tree.members.length });

  const seen = new Set<string>();
  const parentCount = new Map<string, number>();
  for (const link of tree.links) {
    if (!ids.has(link.from) || !ids.has(link.to)) {
      problems.push({ code: 'missing_member', link: link.id });
      continue;
    }
    if (link.from === link.to) {
      problems.push({ code: 'self_link', link: link.id });
      continue;
    }
    const key =
      link.type === 'partner_of' ? `p:${[link.from, link.to].sort().join(':')}` : `c:${link.from}:${link.to}`;
    if (seen.has(key)) problems.push({ code: 'duplicate_link', link: link.id });
    seen.add(key);

    if (link.type === 'parent_of') {
      parentCount.set(link.to, (parentCount.get(link.to) ?? 0) + 1);
      if (generation.get(link.to)! !== generation.get(link.from)! + 1) {
        problems.push({ code: 'generation_parent', link: link.id });
      }
      if (link.consanguineous) problems.push({ code: 'consanguineous_not_partner', link: link.id });
    } else if (generation.get(link.to) !== generation.get(link.from)) {
      problems.push({ code: 'generation_partner', link: link.id });
    }
  }
  for (const [member, count] of parentCount) {
    if (count > 2) problems.push({ code: 'too_many_parents', member });
  }

  // Cycles in parent_of (depth-first search with colours).
  const children = new Map<string, string[]>();
  for (const l of tree.links) {
    if (l.type !== 'parent_of') continue;
    children.set(l.from, [...(children.get(l.from) ?? []), l.to]);
  }
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    state.set(id, 1);
    for (const c of children.get(id) ?? []) {
      const s = state.get(c);
      if (s === 1) return true;
      if (s === undefined && visit(c)) return true;
    }
    state.set(id, 2);
    return false;
  };
  for (const id of ids) {
    if (!state.has(id) && visit(id)) {
      problems.push({ code: 'cycle', member: id });
      break;
    }
  }

  for (const c of tree.conditions) {
    if (!ids.has(c.memberId)) problems.push({ code: 'condition_member', condition: c.id });
  }
  return problems;
}

export function isValidTree(tree: Tree): boolean {
  return validateTree(tree).length === 0;
}

/** A short reason for the model, in English (it is never shown to the user). */
export function describeProblem(p: GraphProblem): string {
  switch (p.code) {
    case 'owner_count':
      return 'The tree must have exactly one owner node.';
    case 'too_many_people':
      return `The family map holds at most ${MAX_PEOPLE} people.`;
    case 'too_many_parents':
      return `Person ${p.member} would have more than 2 parents.`;
    case 'cycle':
      return 'That would make someone their own ancestor.';
    case 'generation_parent':
      return 'A parent must be exactly one generation above their child.';
    case 'generation_partner':
      return 'Partners must be in the same generation.';
    case 'missing_member':
      return 'A link points at a person who is not on the map.';
    case 'self_link':
      return 'A person cannot be linked to themselves.';
    case 'duplicate_link':
      return 'That link already exists.';
    case 'consanguineous_not_partner':
      return 'Only partner links can be marked as a marriage between cousins.';
    case 'condition_member':
      return 'A condition points at a person who is not on the map.';
  }
}
