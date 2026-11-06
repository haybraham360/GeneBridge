import { describe, expect, it } from 'vitest';
import { isConsanguineousPair, markConsanguinity, relationFromTree } from './kinship';
import { owner, parentOf, partners, person, tree } from './testTree';

/** Mariam's family from the demo: father Ahmed and uncle Saeed share an unknown parent; Khalid is Saeed's son. */
function demo(withCousinLink = true) {
  return tree(
    [
      owner(),
      person('ahmed', 'father'),
      person('saeed', 'uncle', { side: 'paternal' }),
      person('gp', 'grandparent', { side: 'paternal', placeholder: true }),
      person('khalid', 'husband'),
    ],
    [parentOf('gp', 'ahmed'), parentOf('gp', 'saeed'), parentOf('ahmed', 'me'), parentOf('saeed', 'khalid'), ...(withCousinLink ? [partners('me', 'khalid')] : [])],
  );
}

describe('automatic cousin detection', () => {
  it('marks a marriage between first cousins, through an unknown grandparent', () => {
    const t = demo();
    expect(isConsanguineousPair(t, 'me', 'khalid')).toBe(true);
    const { tree: marked, marked: ids } = markConsanguinity(t);
    expect(ids).toEqual(['p-me-khalid']);
    expect(marked.links.find((l) => l.id === 'p-me-khalid')?.consanguineous).toBe(true);
  });

  it('does not mark partners who share no ancestor', () => {
    const t = tree([owner(), person('dad', 'father'), person('h', 'husband')], [parentOf('dad', 'me'), partners('me', 'h')]);
    expect(isConsanguineousPair(t, 'me', 'h')).toBe(false);
    expect(markConsanguinity(t).marked).toEqual([]);
  });

  it('keeps a cousin marriage the person marked by hand', () => {
    const t = tree([owner(), person('h', 'husband')], [partners('me', 'h', true)]);
    expect(markConsanguinity(t).tree.links[0].consanguineous).toBe(true);
  });

  it('works out relations from the tree', () => {
    const t = demo();
    expect(relationFromTree(t, 'ahmed')).toEqual({ relation: 'parent', side: 'none' });
    expect(relationFromTree(t, 'saeed')).toEqual({ relation: 'uncle_or_aunt', side: 'paternal' });
    expect(relationFromTree(t, 'gp')).toEqual({ relation: 'grandparent', side: 'paternal' });
    expect(relationFromTree(t, 'khalid')).toEqual({ relation: 'partner', side: 'none' });
  });
});
