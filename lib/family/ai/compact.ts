/**
 * The tree as the describe pipeline sees it: ids, relations, sides,
 * generations and conditions. No labels, no names and no "Other" words:
 * a person whose name was masked carries only their [PERSON_n] token.
 */
import type { Tree } from '../types';
import type { CompactTree } from './schema';

export function toCompact(tree: Tree, tokens: ReadonlyMap<string, string>, proposed: ReadonlySet<string>): CompactTree {
  return {
    members: tree.members.map((m) => ({
      id: m.id,
      relation: m.relation as CompactTree['members'][number]['relation'],
      side: m.side,
      sex: m.sex,
      generation: m.generation,
      token: tokens.get(m.id) ?? null,
      owner: m.isOwner,
      placeholder: m.placeholder,
      proposed: proposed.has(m.id),
      deceased: m.deceased,
    })),
    links: tree.links.map((l) => ({ id: l.id, from: l.from, to: l.to, type: l.type, consanguineous: l.consanguineous })),
    conditions: tree.conditions.map((c) => ({
      id: c.id,
      member: c.memberId,
      condition: c.conditionId ?? 'other',
      status: c.status,
    })),
  };
}

export function fromCompact(compact: CompactTree): { tree: Tree; tokens: Map<string, string> } {
  const tokens = new Map<string, string>();
  for (const m of compact.members) if (m.token) tokens.set(m.id, m.token);
  return {
    tokens,
    tree: {
      members: compact.members.map((m) => ({
        id: m.id,
        label: null,
        relation: m.relation,
        side: m.side,
        sex: m.sex,
        generation: m.generation,
        deceased: m.deceased,
        createdBy: 'ai',
        isOwner: m.owner,
        placeholder: m.placeholder,
      })),
      links: compact.links.map((l) => ({ ...l })),
      conditions: compact.conditions.map((c) => ({
        id: c.id,
        memberId: c.member,
        conditionId: c.condition === 'other' ? null : c.condition,
        otherText: c.condition === 'other' ? '' : null,
        status: c.status,
        source: 'ai',
      })),
    },
  };
}

/** The model's view: shorter keys, only what it needs to place people and refer to them. */
export function forModel(compact: CompactTree): unknown {
  return {
    people: compact.members.map((m) => ({
      id: m.owner ? 'self' : m.id,
      relation: m.relation,
      side: m.side,
      sex: m.sex,
      generation: m.generation,
      ...(m.token ? { name: m.token } : {}),
      ...(m.placeholder ? { unknown_placeholder: true } : {}),
      ...(m.proposed ? { proposed: true } : {}),
      ...(m.deceased ? { deceased: true } : {}),
    })),
    links: compact.links.map((l) => {
      const owner = compact.members.find((m) => m.owner)?.id;
      const id = (x: string) => (x === owner ? 'self' : x);
      return { from: id(l.from), to: id(l.to), type: l.type, ...(l.consanguineous ? { cousins: true } : {}) };
    }),
    conditions: compact.conditions.map((c) => ({
      person: compact.members.find((m) => m.id === c.member)?.owner ? 'self' : c.member,
      condition: c.condition,
      status: c.status,
    })),
  };
}
