import { describe, expect, it } from 'vitest';
import { applyOp, createContext, finishTurn } from './ai/apply';
import type { Op } from './ai/schema';
import { layoutTree, NODE_W } from './layout';
import { keepItem, proposalCounts, proposedIds, reviewItems, skipItem } from './proposal';
import { owner, tree } from './testTree';
import { isValidTree } from './validate';

let next = 0;
const uuid = () => `00000000-0000-4000-8000-${(next += 1).toString().padStart(12, '0')}`;
const base = tree([owner()]);

function propose(ops: Op[]) {
  const ctx = createContext(base, new Map(), () => {}, uuid);
  for (const op of ops) applyOp(ctx, op);
  finishTurn(ctx);
  return ctx.tree;
}

const demoOps: Op[] = [
  { tool: 'add_person', input: { temp_id: 'f', relation_hint: 'father', side: 'none', sex: 'unknown', generation: -1, label_token: null } },
  { tool: 'add_person', input: { temp_id: 'u', relation_hint: 'uncle', side: 'paternal', sex: 'unknown', generation: -1, label_token: null } },
  { tool: 'add_person', input: { temp_id: 'h', relation_hint: 'husband', side: 'none', sex: 'unknown', generation: 0, label_token: null } },
  { tool: 'add_person', input: { temp_id: 'g', relation_hint: 'grandmother', side: 'maternal', sex: 'unknown', generation: -2, label_token: null } },
  { tool: 'add_link', input: { from: 'u', to: 'h', type: 'parent_of', consanguineous: false } },
];

describe('proposed changes', () => {
  it('shows everything new as proposed, with counts for the review bar', () => {
    const working = propose(demoOps);
    expect(proposedIds(base, working).members.size).toBe(working.members.length - 1);
    expect(proposalCounts(base, working)).toMatchObject({ people: 4, cousins: 1 });
  });

  it('reviews one by one: keeping each item leaves a valid saved tree', () => {
    const working = propose(demoOps);
    let saved = base;
    for (let guard = 0; guard < 20; guard++) {
      const items = reviewItems(saved, working);
      if (!items.length) break;
      const kept = keepItem(saved, items[0]);
      expect(kept).not.toBeNull();
      saved = kept!;
      expect(isValidTree(saved)).toBe(true);
    }
    expect(reviewItems(saved, working)).toEqual([]);
    expect(saved.members).toHaveLength(working.members.length);
  });

  it('skipping a person removes them and the unknown connectors only they needed', () => {
    const working = propose(demoOps.slice(0, 2));
    const uncle = reviewItems(base, working).find((i) => working.members.find((m) => m.id === i.memberId)?.relation === 'uncle')!;
    const after = skipItem(base, working, uncle);
    expect(after.members.some((m) => m.relation === 'uncle')).toBe(false);
    expect(after.members.some((m) => m.placeholder)).toBe(false);
    expect(isValidTree(after)).toBe(true);
  });
});

describe('automatic layout', () => {
  it('puts generations in rows and the father\'s side on the reading-start side, mirrored in Arabic', () => {
    const working = propose(demoOps);
    const byRelation = (r: string) => working.members.find((m) => m.relation === r)!.id;
    const ltr = layoutTree(working);
    const rtl = layoutTree(working, { rtl: true });
    const uncle = byRelation('uncle');
    const grandmother = byRelation('grandmother');
    expect(ltr.pos[uncle].y).toBeLessThan(ltr.pos[byRelation('husband')].y);
    expect(ltr.pos[uncle].x).toBeLessThan(ltr.pos[grandmother].x);
    expect(rtl.pos[uncle].x).toBeGreaterThan(rtl.pos[grandmother].x);
    // Mirrored exactly.
    expect(rtl.pos[uncle].x).toBeCloseTo(rtl.width - ltr.pos[uncle].x - NODE_W);
    // No two people overlap in a row.
    const rows = new Map<number, number[]>();
    for (const p of Object.values(ltr.pos)) rows.set(p.y, [...(rows.get(p.y) ?? []), p.x]);
    for (const xs of rows.values()) {
      const sorted = xs.sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(NODE_W);
    }
    // The cousin marriage is drawn as a double line.
    expect(ltr.segments.some((s) => s.kind === 'cousins')).toBe(true);
  });
});
