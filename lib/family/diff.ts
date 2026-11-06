/** Differences between two family trees, by id. Used to stream changes and to save only what changed. */
import type { Link, Member, MemberCondition, Tree } from './types';

export type TreeDiff = {
  upsert: { members: Member[]; links: Link[]; conditions: MemberCondition[] };
  remove: { members: string[]; links: string[]; conditions: string[] };
};

function diffList<T extends { id: string }>(before: T[], after: T[]): { upsert: T[]; remove: string[] } {
  const old = new Map(before.map((x) => [x.id, JSON.stringify(x)]));
  const now = new Set(after.map((x) => x.id));
  return {
    upsert: after.filter((x) => old.get(x.id) !== JSON.stringify(x)),
    remove: before.filter((x) => !now.has(x.id)).map((x) => x.id),
  };
}

export function diffTrees(before: Tree, after: Tree): TreeDiff {
  const m = diffList(before.members, after.members);
  const l = diffList(before.links, after.links);
  const c = diffList(before.conditions, after.conditions);
  return {
    upsert: { members: m.upsert, links: l.upsert, conditions: c.upsert },
    remove: { members: m.remove, links: l.remove, conditions: c.remove },
  };
}

export function isEmptyDiff(d: TreeDiff): boolean {
  return (
    d.upsert.members.length + d.upsert.links.length + d.upsert.conditions.length +
      d.remove.members.length + d.remove.links.length + d.remove.conditions.length ===
    0
  );
}

/** Applies a diff: upserts replace by id, removals drop by id. */
export function applyDiff(tree: Tree, d: TreeDiff): Tree {
  const merge = <T extends { id: string }>(list: T[], up: T[], rm: string[]): T[] => {
    const gone = new Set(rm);
    const byId = new Map(up.map((x) => [x.id, x]));
    const kept = list.filter((x) => !gone.has(x.id)).map((x) => byId.get(x.id) ?? x);
    const known = new Set(list.map((x) => x.id));
    return [...kept, ...up.filter((x) => !known.has(x.id) && !gone.has(x.id))];
  };
  return {
    members: merge(tree.members, d.upsert.members, d.remove.members),
    links: merge(tree.links, d.upsert.links, d.remove.links),
    conditions: merge(tree.conditions, d.upsert.conditions, d.remove.conditions),
  };
}
