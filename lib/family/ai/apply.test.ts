import { describe, expect, it } from 'vitest';
import { owner, tree } from '../testTree';
import { isValidTree } from '../validate';
import { applyOp, createContext, finishTurn, turnCounts } from './apply';
import { parseOp, type Change, type Op } from './schema';

let next = 0;
const uuid = () => `00000000-0000-4000-8000-${(next += 1).toString().padStart(12, '0')}`;

function run(ops: Op[], start = tree([owner()])) {
  const changes: Change[] = [];
  const ctx = createContext(start, new Map(), (c) => changes.push(c), uuid);
  const results = ops.map((op) => applyOp(ctx, op));
  finishTurn(ctx);
  return { ctx, changes, results, counts: turnCounts(ctx) };
}

const add = (temp_id: string, relation_hint: string, side: 'paternal' | 'maternal' | 'none' = 'none', label_token: string | null = null): Op => ({
  tool: 'add_person',
  input: { temp_id, relation_hint, side, sex: 'unknown', generation: 0, label_token },
});

describe('applying describe operations', () => {
  it('builds the demo family, with an unknown grandparent and a cousin marriage', () => {
    const { ctx, counts } = run([
      add('p1', 'father', 'none', '[PERSON_1]'),
      add('p2', 'uncle', 'paternal', '[PERSON_2]'),
      add('p3', 'husband', 'none', '[PERSON_3]'),
      add('p4', 'grandmother', 'maternal', '[PERSON_4]'),
      { tool: 'add_link', input: { from: 'p2', to: 'p3', type: 'parent_of', consanguineous: false } },
      { tool: 'add_condition', input: { person: 'p2', condition_query: 'beta-thalassemia major', status: 'known' } },
      { tool: 'add_condition', input: { person: 'p4', condition_query: 'hearing problems', status: 'not_sure' } },
      { tool: 'done', input: { summary: '' } },
    ]);
    const t = ctx.tree;
    expect(isValidTree(t)).toBe(true);
    expect(counts.people).toBe(4);
    expect(counts.consanguinity).toBe(1);
    const husband = t.members.find((m) => m.relation === 'husband')!;
    expect(t.links.find((l) => l.type === 'partner_of' && l.to === husband.id)?.consanguineous).toBe(true);
    const placeholders = t.members.filter((m) => m.placeholder);
    // The paternal grandparent connecting father and uncle, and the mother connecting the grandmother.
    expect(placeholders.map((p) => p.relation).sort()).toEqual(['grandparent', 'mother']);
    expect(t.conditions.find((c) => c.conditionId === 'beta_thalassemia')?.status).toBe('known');
    expect(t.conditions.find((c) => c.otherText === 'hearing problems')).toMatchObject({ conditionId: null, status: 'not_sure' });
    // Our matcher, not the model, asks "Do you mean …?".
    expect(ctx.questions).toEqual([expect.objectContaining({ kind: 'condition_match', candidates: ['gjb2_hearing_loss'] })]);
  });

  it('refuses a sided relative without a side, so the planner asks', () => {
    const { results, counts } = run([add('u', 'uncle')]);
    expect(results[0]).toMatchObject({ ok: false });
    expect(counts.people).toBe(0);
  });

  it('turns a placeholder into the real person when they are described later', () => {
    const first = run([add('s', 'sister')]);
    const ph = first.ctx.tree.members.find((m) => m.placeholder)!;
    expect(ph.relation).toBe('parent');
    const second = run([add('d', 'father', 'none', '[PERSON_1]')], first.ctx.tree);
    const dad = second.ctx.tree.members.find((m) => m.relation === 'father')!;
    expect(dad.id).toBe(ph.id);
    expect(dad.placeholder).toBe(false);
    expect(second.ctx.tree.members.filter((m) => m.placeholder)).toHaveLength(0);
  });

  it('rejects links that break the graph rules', () => {
    const { results } = run([
      add('d', 'father'),
      add('b', 'brother'),
      { tool: 'add_link', input: { from: 'b', to: 'd', type: 'parent_of', consanguineous: false } },
    ]);
    expect(results[2]).toMatchObject({ ok: false });
  });

  it('allows at most two questions per turn', () => {
    const q = (i: number): Op => ({ tool: 'ask_user', input: { question: `Q${i}?`, choices: ['Yes', 'No'] } });
    const { results, ctx } = run([q(1), q(2), q(3)]);
    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
    expect(ctx.questions).toHaveLength(2);
  });

  it('checks every tool input strictly', () => {
    expect(parseOp('add_person', { temp_id: 'p', relation_hint: 'uncle', side: 'paternal', sex: 'male', generation: -1, label_token: 'Saeed' })).toHaveProperty('error');
    expect(parseOp('add_person', { temp_id: 'p', relation_hint: 'king', side: 'none', sex: 'male', generation: 0, label_token: null })).toHaveProperty('error');
    expect(parseOp('add_condition', { person: 'self', condition_query: 'CF', status: 'carrier', risk: '25%' })).toHaveProperty('error');
    expect(parseOp('delete_everything', {})).toHaveProperty('error');
    expect(parseOp('add_link', { from: 'self', to: 'p1', type: 'partner_of', consanguineous: false })).toHaveProperty('op');
  });

  it(`stops at the people limit`, () => {
    const ops = Array.from({ length: 70 }, (_, i): Op => ({ tool: 'add_person', input: { temp_id: `r${i}`, relation_hint: 'relative', side: 'none', sex: 'unknown', generation: 0, label_token: null } }));
    const { ctx } = run(ops);
    expect(ctx.tree.members.length).toBeLessThanOrEqual(60);
  });
});
