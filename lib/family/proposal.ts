/**
 * Proposed changes (task 13, section 1). The browser keeps two trees: the
 * saved one and the working one (saved plus everything the AI proposed).
 * Whatever differs is drawn dashed until the person keeps it. Nothing is
 * saved until they tap Keep.
 */
import { applyDiff, diffTrees, isEmptyDiff, type TreeDiff } from './diff';
import type { Tree } from './types';
import { isValidTree } from './validate';

export type Proposed = { members: Set<string>; links: Set<string>; conditions: Set<string> };

export function proposedIds(base: Tree, working: Tree): Proposed {
  const d = diffTrees(base, working);
  return {
    members: new Set(d.upsert.members.map((m) => m.id)),
    links: new Set(d.upsert.links.map((l) => l.id)),
    conditions: new Set(d.upsert.conditions.map((c) => c.id)),
  };
}

export function hasProposals(base: Tree, working: Tree): boolean {
  return !isEmptyDiff(diffTrees(base, working));
}

export type ProposalCounts = { people: number; links: number; conditions: number; cousins: number; placeholders: number };

export function proposalCounts(base: Tree, working: Tree): ProposalCounts {
  const d = diffTrees(base, working);
  const baseIds = new Set(base.members.map((m) => m.id));
  const baseLink = new Map(base.links.map((l) => [l.id, l]));
  return {
    people: d.upsert.members.filter((m) => !m.placeholder && (!baseIds.has(m.id) || base.members.find((b) => b.id === m.id)?.placeholder)).length,
    placeholders: d.upsert.members.filter((m) => m.placeholder && !baseIds.has(m.id)).length,
    links: d.upsert.links.length,
    conditions: d.upsert.conditions.length,
    cousins: d.upsert.links.filter((l) => l.consanguineous && !baseLink.get(l.id)?.consanguineous).length,
  };
}

export type ReviewItem = {
  key: string;
  kind: 'person' | 'condition' | 'link';
  /** The person the item is about (for a link, the first end). */
  memberId: string;
  diff: TreeDiff;
};

const emptyDiff = (): TreeDiff => ({ upsert: { members: [], links: [], conditions: [] }, remove: { members: [], links: [], conditions: [] } });

/** Proposed changes grouped for "Review one by one": one item per person, then lone conditions and links. */
export function reviewItems(base: Tree, working: Tree): ReviewItem[] {
  const d = diffTrees(base, working);
  const inBase = new Set(base.members.map((m) => m.id));
  const placeholders = new Set(d.upsert.members.filter((m) => m.placeholder).map((m) => m.id));
  const used = { links: new Set<string>(), conditions: new Set<string>(), members: new Set<string>() };
  const items: ReviewItem[] = [];

  const people = d.upsert.members.filter((m) => !m.placeholder).sort((a, b) => a.generation - b.generation);
  for (const person of people) {
    const diff = emptyDiff();
    diff.upsert.members.push(person);
    used.members.add(person.id);
    const reachable = new Set([...inBase, person.id, ...placeholders]);
    for (const l of d.upsert.links) {
      if (used.links.has(l.id) || (l.from !== person.id && l.to !== person.id)) continue;
      if (!reachable.has(l.from) || !reachable.has(l.to)) continue;
      diff.upsert.links.push(l);
      used.links.add(l.id);
      // A placeholder connector comes with the person it connects, with its own links to saved people.
      for (const end of [l.from, l.to]) {
        if (!placeholders.has(end) || used.members.has(end)) continue;
        used.members.add(end);
        diff.upsert.members.push(d.upsert.members.find((m) => m.id === end)!);
        for (const pl of d.upsert.links) {
          if (used.links.has(pl.id) || (pl.from !== end && pl.to !== end)) continue;
          const other = pl.from === end ? pl.to : pl.from;
          if (inBase.has(other) || placeholders.has(other)) {
            diff.upsert.links.push(pl);
            used.links.add(pl.id);
          }
        }
      }
    }
    for (const c of d.upsert.conditions) {
      if (c.memberId === person.id && !used.conditions.has(c.id)) {
        diff.upsert.conditions.push(c);
        used.conditions.add(c.id);
      }
    }
    items.push({ key: `person:${person.id}`, kind: 'person', memberId: person.id, diff });
  }
  for (const c of d.upsert.conditions) {
    if (used.conditions.has(c.id)) continue;
    const diff = emptyDiff();
    diff.upsert.conditions.push(c);
    items.push({ key: `condition:${c.id}`, kind: 'condition', memberId: c.memberId, diff });
  }
  for (const l of d.upsert.links) {
    if (used.links.has(l.id)) continue;
    const diff = emptyDiff();
    diff.upsert.links.push(l);
    items.push({ key: `link:${l.id}`, kind: 'link', memberId: l.from, diff });
  }
  // Removals (a placeholder replaced by the real person) go with the first item.
  if (items.length && (d.remove.members.length || d.remove.links.length || d.remove.conditions.length)) {
    items[0].diff.remove = d.remove;
  }
  return items;
}

/** Keeps one reviewed item: the saved tree after it, or null if it can't stand on its own yet. */
export function keepItem(base: Tree, item: ReviewItem): Tree | null {
  const next = applyDiff(base, item.diff);
  return isValidTree(next) ? next : null;
}

/** Removes proposed placeholder connectors that no longer connect anyone. */
export function prunePlaceholders(base: Tree, working: Tree): Tree {
  const inBase = new Set(base.members.map((m) => m.id));
  let tree = working;
  for (;;) {
    const orphan = tree.members.find((m) => m.placeholder && !inBase.has(m.id) && tree.links.filter((l) => l.from === m.id || l.to === m.id).length < 2);
    if (!orphan) return tree;
    tree = {
      members: tree.members.filter((m) => m.id !== orphan.id),
      links: tree.links.filter((l) => l.from !== orphan.id && l.to !== orphan.id),
      conditions: tree.conditions.filter((c) => c.memberId !== orphan.id),
    };
  }
}

/** Skips one reviewed item: the working tree without it (saved versions come back for changed things). */
export function skipItem(base: Tree, working: Tree, item: ReviewItem): Tree {
  const baseMember = new Map(base.members.map((m) => [m.id, m]));
  const baseLink = new Map(base.links.map((l) => [l.id, l]));
  const baseCondition = new Map(base.conditions.map((c) => [c.id, c]));
  const dropMembers = new Set(item.kind === 'person' ? item.diff.upsert.members.filter((m) => !baseMember.has(m.id)).map((m) => m.id) : []);
  const linkIds = new Set(item.diff.upsert.links.map((l) => l.id));
  const conditionIds = new Set(item.diff.upsert.conditions.map((c) => c.id));
  const memberIds = new Set(item.diff.upsert.members.map((m) => m.id));

  const next: Tree = {
    members: working.members
      .filter((m) => !dropMembers.has(m.id))
      .map((m) => (memberIds.has(m.id) && baseMember.has(m.id) ? baseMember.get(m.id)! : m)),
    links: working.links
      .filter((l) => !dropMembers.has(l.from) && !dropMembers.has(l.to))
      .flatMap((l) => (linkIds.has(l.id) ? (baseLink.has(l.id) ? [baseLink.get(l.id)!] : []) : [l])),
    conditions: working.conditions
      .filter((c) => !dropMembers.has(c.memberId))
      .flatMap((c) => (conditionIds.has(c.id) ? (baseCondition.has(c.id) ? [baseCondition.get(c.id)!] : []) : [c])),
  };
  // A skipped person's links to people still proposed go too.
  return prunePlaceholders(base, next);
}
