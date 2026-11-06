/** Small read helpers over a family tree. Pure; used in the browser and on the server. */
import type { Link, Member, Tree } from './types';

export function memberMap(tree: Tree): Map<string, Member> {
  return new Map(tree.members.map((m) => [m.id, m]));
}

export function parentsOf(tree: Tree, id: string): string[] {
  return tree.links.filter((l) => l.type === 'parent_of' && l.to === id).map((l) => l.from);
}

export function childrenOf(tree: Tree, id: string): string[] {
  return tree.links.filter((l) => l.type === 'parent_of' && l.from === id).map((l) => l.to);
}

export function partnersOf(tree: Tree, id: string): string[] {
  return tree.links
    .filter((l) => l.type === 'partner_of' && (l.from === id || l.to === id))
    .map((l) => (l.from === id ? l.to : l.from));
}

export function siblingsOf(tree: Tree, id: string): string[] {
  const parents = parentsOf(tree, id);
  const out = new Set<string>();
  for (const p of parents) for (const c of childrenOf(tree, p)) if (c !== id) out.add(c);
  return [...out];
}

export function partnerLink(tree: Tree, a: string, b: string): Link | undefined {
  return tree.links.find(
    (l) => l.type === 'partner_of' && ((l.from === a && l.to === b) || (l.from === b && l.to === a)),
  );
}

export function hasLink(tree: Tree, from: string, to: string, type: Link['type']): boolean {
  return type === 'partner_of'
    ? Boolean(partnerLink(tree, from, to))
    : tree.links.some((l) => l.type === type && l.from === from && l.to === to);
}

/** Every ancestor of a person, with how many generations up they are. */
export function ancestorsOf(tree: Tree, id: string, maxDepth = 6): Map<string, number> {
  const found = new Map<string, number>();
  let frontier = [id];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const person of frontier) {
      for (const p of parentsOf(tree, person)) {
        if (!found.has(p)) {
          found.set(p, depth);
          next.push(p);
        }
      }
    }
    frontier = next;
  }
  return found;
}

/** Removes a person with their links and conditions. */
export function removeMember(tree: Tree, id: string): Tree {
  return {
    members: tree.members.filter((m) => m.id !== id),
    links: tree.links.filter((l) => l.from !== id && l.to !== id),
    conditions: tree.conditions.filter((c) => c.memberId !== id),
  };
}
