/** Small tree builders for tests and the eval. Not used by the app. */
import { infoFor } from './relations';
import type { Link, Member, Side, Tree } from './types';

let n = 0;
export const testId = (prefix = 'x') => `${prefix}${(n += 1).toString().padStart(4, '0')}`;

export function owner(id = 'me'): Member {
  return { id, label: null, relation: 'self', side: 'none', sex: 'female', generation: 0, deceased: false, createdBy: 'manual', isOwner: true, placeholder: false };
}

export function person(id: string, relation: string, opts: { side?: Side; label?: string | null; placeholder?: boolean; generation?: number } = {}): Member {
  const info = infoFor(relation);
  return {
    id,
    label: opts.label ?? null,
    relation,
    side: opts.side ?? 'none',
    sex: info.sex,
    generation: opts.generation ?? info.generation,
    deceased: false,
    createdBy: 'manual',
    isOwner: false,
    placeholder: opts.placeholder ?? false,
  };
}

export function parentOf(from: string, to: string): Link {
  return { id: `l-${from}-${to}`, from, to, type: 'parent_of', consanguineous: false };
}

export function partners(a: string, b: string, consanguineous = false): Link {
  return { id: `p-${a}-${b}`, from: a, to: b, type: 'partner_of', consanguineous };
}

export function tree(members: Member[], links: Link[] = []): Tree {
  return { members, links, conditions: [] };
}
