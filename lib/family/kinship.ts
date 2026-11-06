/**
 * Kinship worked out from the shape of the tree: how a person is related to
 * the owner, and whether two partners are blood relatives (automatic cousin
 * detection). Deterministic: the AI never decides consanguinity.
 */
import { ancestorsOf, childrenOf, memberMap, parentsOf, partnersOf, siblingsOf } from './graph';
import type { Relation } from './relations';
import type { Side, Tree } from './types';
import { ownerOf } from './types';

/**
 * Two partners are blood relatives when they share an ancestor up to three
 * generations back (first and second cousins, uncle and niece, and so on).
 * Placeholder connectors count: "my father's brother's son" shares the
 * grandparents even when they are unknown.
 */
export function sharedAncestor(tree: Tree, a: string, b: string, maxDepth = 3): string | null {
  const up = ancestorsOf(tree, a, maxDepth);
  if (up.has(b)) return null; // An ancestor, not a cousin; validation rejects this anyway.
  const other = ancestorsOf(tree, b, maxDepth);
  if (other.has(a)) return null;
  for (const id of up.keys()) if (other.has(id)) return id;
  return null;
}

export function isConsanguineousPair(tree: Tree, a: string, b: string): boolean {
  return sharedAncestor(tree, a, b) !== null;
}

/** Re-marks every partner link from the tree's shape. Returns the ids newly marked. */
export function markConsanguinity(tree: Tree): { tree: Tree; marked: string[] } {
  const marked: string[] = [];
  const links = tree.links.map((l) => {
    if (l.type !== 'partner_of') return l;
    const related = isConsanguineousPair(tree, l.from, l.to);
    if (related && !l.consanguineous) marked.push(l.id);
    // A manual "related by blood" mark is kept even if the tree can't show the shared ancestor.
    return related ? { ...l, consanguineous: true } : l;
  });
  return { tree: { ...tree, links }, marked };
}

function sideOfParent(tree: Tree, parentId: string): Side {
  const sex = memberMap(tree).get(parentId)?.sex;
  return sex === 'male' ? 'paternal' : sex === 'female' ? 'maternal' : 'none';
}

/** How `id` is related to the owner, from the links alone; null when the tree can't tell. */
export function relationFromTree(tree: Tree, id: string): { relation: Relation; side: Side } | null {
  const owner = ownerOf(tree);
  if (!owner) return null;
  const me = owner.id;
  if (id === me) return { relation: 'self', side: 'none' };

  if (partnersOf(tree, me).includes(id)) return { relation: 'partner', side: 'none' };
  const myParents = parentsOf(tree, me);
  if (myParents.includes(id)) return { relation: 'parent', side: 'none' };
  if (childrenOf(tree, me).includes(id)) return { relation: 'child', side: 'none' };
  if (siblingsOf(tree, me).includes(id)) return { relation: 'sibling', side: 'none' };

  for (const p of myParents) {
    const side = sideOfParent(tree, p);
    if (parentsOf(tree, p).includes(id)) return { relation: 'grandparent', side };
    if (siblingsOf(tree, p).includes(id)) return { relation: 'uncle_or_aunt', side };
    for (const s of siblingsOf(tree, p)) {
      if (childrenOf(tree, s).includes(id)) return { relation: 'cousin', side };
    }
  }
  for (const s of siblingsOf(tree, me)) {
    if (childrenOf(tree, s).includes(id)) return { relation: 'sibling_child', side: 'none' };
  }
  for (const c of childrenOf(tree, me)) {
    if (childrenOf(tree, c).includes(id)) return { relation: 'grandchild', side: 'none' };
  }
  for (const partner of partnersOf(tree, me)) {
    if (parentsOf(tree, partner).includes(id)) return { relation: 'partner_parent', side: 'none' };
  }
  return null;
}
