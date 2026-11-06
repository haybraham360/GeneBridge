import { describe, expect, it } from 'vitest';
import { owner, parentOf, partners, person, tree } from './testTree';
import { MAX_PEOPLE } from './types';
import { validateTree } from './validate';

const codes = (t: ReturnType<typeof tree>) => validateTree(t).map((p) => p.code);

describe('family graph validation', () => {
  const base = () =>
    tree(
      [owner(), person('dad', 'father'), person('mum', 'mother'), person('gp', 'grandparent', { side: 'paternal' })],
      [parentOf('dad', 'me'), parentOf('mum', 'me'), parentOf('gp', 'dad')],
    );

  it('accepts a consistent tree', () => {
    expect(validateTree(base())).toEqual([]);
  });

  it('needs exactly one owner node', () => {
    const t = base();
    expect(codes({ ...t, members: t.members.filter((m) => !m.isOwner) })).toContain('owner_count');
    expect(codes({ ...t, members: [...t.members, owner('me2')] })).toContain('owner_count');
  });

  it('allows at most two parents', () => {
    const t = base();
    const third = person('step', 'parent');
    expect(codes({ ...t, members: [...t.members, third], links: [...t.links, parentOf('step', 'me')] })).toContain('too_many_parents');
  });

  it('rejects cycles', () => {
    // Someone who is both the owner's parent and the owner's child.
    const t = tree([owner(), person('a', 'father', { generation: -1 })], [parentOf('a', 'me'), parentOf('me', 'a')]);
    expect(codes(t)).toContain('cycle');
  });

  it('keeps generations consistent', () => {
    const t = base();
    // A "parent" in the same generation as the child.
    const wrong = { ...t, members: [...t.members, person('sib', 'brother')], links: [...t.links, parentOf('sib', 'me')] };
    expect(codes(wrong)).toContain('generation_parent');
    // Partners in different generations.
    expect(codes({ ...t, links: [...t.links, partners('me', 'dad')] })).toContain('generation_partner');
  });

  it('rejects links to people who are not on the map, self-links and duplicates', () => {
    const t = base();
    expect(codes({ ...t, links: [...t.links, parentOf('ghost', 'me')] })).toContain('missing_member');
    expect(codes({ ...t, links: [...t.links, partners('me', 'me')] })).toContain('self_link');
    expect(codes({ ...t, links: [...t.links, { ...parentOf('dad', 'me'), id: 'dup' }] })).toContain('duplicate_link');
  });

  it('marks only partner links as cousin marriages', () => {
    const t = base();
    expect(codes({ ...t, links: t.links.map((l, i) => (i === 0 ? { ...l, consanguineous: true } : l)) })).toContain('consanguineous_not_partner');
  });

  it(`holds at most ${MAX_PEOPLE} people`, () => {
    const many = Array.from({ length: MAX_PEOPLE }, (_, i) => person(`r${i}`, 'relative'));
    expect(codes(tree([owner(), ...many]))).toContain('too_many_people');
  });
});
