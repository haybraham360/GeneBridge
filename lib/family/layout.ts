/**
 * Automatic family tree layout (task 13, section 5). A small generational
 * layout, no library:
 *   - generations are rows;
 *   - partners (and two parents of the same child) sit side by side;
 *   - children are centred under their parents' link;
 *   - the father's side is on the reading-start side and the mother's side
 *     on the other, mirrored for Arabic (right to left).
 * Pure: positions and line segments only. The component draws them.
 */
import { memberMap, parentsOf } from './graph';
import type { Member, Tree } from './types';

export const NODE_W = 136;
export const NODE_H = 54;
const GAP = 22;
const COUPLE_GAP = 40;
const ROW_H = 128;
const BAR_GAP = 26;
const PAD = 16;

export type Segment = {
  d: string;
  /** Links this line stands for; it is drawn dashed when they are all proposed. */
  links: string[];
  kind: 'partner' | 'cousins' | 'coparent' | 'child';
};

export type Layout = {
  pos: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
  segments: Segment[];
  /** Where to write "cousins" under a double line. */
  cousinLabels: { x: number; y: number; link: string }[];
};

function sideKey(m: Member): number {
  if (m.isOwner) return 0;
  if (m.side === 'paternal') return -2;
  if (m.side === 'maternal') return 2;
  if (m.relation === 'father' || m.relation === 'partner_father') return -1;
  if (m.relation === 'mother' || m.relation === 'partner_mother') return 1;
  return 0;
}

type Block = { ids: string[]; x: number };

/** Father's side first, then the owner's own line, then the mother's side: always, in every row. */
function sideGroup(b: Block, byId: Map<string, Member>): number {
  const sum = b.ids.reduce((acc, id) => {
    const side = byId.get(id)!.side;
    return acc + (side === 'paternal' ? -1 : side === 'maternal' ? 1 : 0);
  }, 0);
  return Math.sign(sum);
}

export function layoutTree(tree: Tree, { rtl = false }: { rtl?: boolean } = {}): Layout {
  const byId = memberMap(tree);
  if (tree.members.length === 0) return { pos: {}, width: 0, height: 0, segments: [], cousinLabels: [] };

  const gens = [...new Set(tree.members.map((m) => m.generation))].sort((a, b) => a - b);
  const rowOf = new Map(gens.map((g, i) => [g, i]));

  // Blocks: partners, and two parents of the same child, in the same row.
  const parent = new Map<string, string>(tree.members.map((m) => [m.id, m.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  const unite = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const sameRow = (a: string, b: string) => byId.get(a)?.generation === byId.get(b)?.generation;
  for (const l of tree.links) if (l.type === 'partner_of' && sameRow(l.from, l.to)) unite(l.from, l.to);
  const coparents: [string, string][] = [];
  for (const m of tree.members) {
    const ps = parentsOf(tree, m.id);
    if (ps.length === 2 && sameRow(ps[0], ps[1])) {
      unite(ps[0], ps[1]);
      coparents.push([ps[0], ps[1]]);
    }
  }

  const rows: Block[][] = gens.map(() => []);
  const groups = new Map<string, string[]>();
  for (const m of tree.members) groups.set(find(m.id), [...(groups.get(find(m.id)) ?? []), m.id]);
  for (const ids of groups.values()) {
    ids.sort((a, b) => sideKey(byId.get(a)!) - sideKey(byId.get(b)!));
    rows[rowOf.get(byId.get(ids[0])!.generation)!].push({ ids, x: 0 });
  }

  const x = new Map<string, number>();
  const blockWidth = (b: Block) => b.ids.length * NODE_W + (b.ids.length - 1) * COUPLE_GAP;
  const offset = (b: Block, id: string) => b.ids.indexOf(id) * (NODE_W + COUPLE_GAP);
  const centre = (id: string) => (x.get(id) ?? 0) + NODE_W / 2;
  const childrenOfId = new Map<string, string[]>();
  const parentsOfId = new Map<string, string[]>();
  for (const l of tree.links) {
    if (l.type !== 'parent_of') continue;
    childrenOfId.set(l.from, [...(childrenOfId.get(l.from) ?? []), l.to]);
    parentsOfId.set(l.to, [...(parentsOfId.get(l.to) ?? []), l.from]);
  }
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

  /** Places a row's blocks in order with gaps, then shifts the row towards where it wants to be. */
  const place = (row: Block[], desired: Map<Block, number>) => {
    row.sort(
      (a, b) =>
        sideGroup(a, byId) - sideGroup(b, byId) ||
        (desired.get(a) ?? a.x) - (desired.get(b) ?? b.x) ||
        mean(a.ids.map((i) => sideKey(byId.get(i)!))) - mean(b.ids.map((i) => sideKey(byId.get(i)!))),
    );
    let cursor = -Infinity;
    for (const b of row) {
      b.x = Math.max(desired.get(b) ?? b.x, cursor);
      cursor = b.x + blockWidth(b) + GAP;
    }
    const deltas = row.filter((b) => desired.has(b)).map((b) => b.x - desired.get(b)!);
    const shift = deltas.length ? mean(deltas) : 0;
    for (const b of row) {
      b.x -= shift;
      b.ids.forEach((id) => x.set(id, b.x + offset(b, id)));
    }
  };

  /** Orders a couple so each partner sits on the side of their own parents. */
  const orderWithin = (b: Block) => {
    if (b.ids.length < 2) return;
    const key = (id: string) => {
      const ps = parentsOfId.get(id) ?? [];
      return ps.length ? mean(ps.map(centre)) : null;
    };
    b.ids.sort((p, q) => {
      const kp = key(p);
      const kq = key(q);
      if (kp !== null && kq !== null && kp !== kq) return kp - kq;
      return sideKey(byId.get(p)!) - sideKey(byId.get(q)!);
    });
  };

  // Initial placement: side order, packed.
  for (const row of rows) {
    row.sort((a, b) => mean(a.ids.map((i) => sideKey(byId.get(i)!))) - mean(b.ids.map((i) => sideKey(byId.get(i)!))));
    let cursor = 0;
    for (const b of row) {
      b.x = cursor;
      b.ids.forEach((id) => x.set(id, b.x + offset(b, id)));
      cursor += blockWidth(b) + GAP;
    }
  }

  const want = (b: Block, related: Map<string, string[]>) => {
    const wishes: number[] = [];
    for (const id of b.ids) {
      const rel = related.get(id) ?? [];
      if (rel.length) wishes.push(mean(rel.map(centre)) - NODE_W / 2 - offset(b, id));
    }
    return wishes.length ? mean(wishes) : null;
  };

  for (let pass = 0; pass < 4; pass++) {
    for (let r = 1; r < rows.length; r++) {
      const desired = new Map<Block, number>();
      for (const b of rows[r]) {
        orderWithin(b);
        const w = want(b, parentsOfId);
        if (w !== null) desired.set(b, w);
      }
      place(rows[r], desired);
    }
    for (let r = rows.length - 2; r >= 0; r--) {
      const desired = new Map<Block, number>();
      for (const b of rows[r]) {
        const w = want(b, childrenOfId);
        if (w !== null) desired.set(b, w);
      }
      place(rows[r], desired);
    }
  }

  // Normalise, then mirror for right-to-left.
  const minX = Math.min(...[...x.values()]);
  const maxX = Math.max(...[...x.values()]) + NODE_W;
  const width = maxX - minX + PAD * 2;
  const height = rows.length * ROW_H - (ROW_H - NODE_H) + PAD * 2;
  const pos: Layout['pos'] = {};
  for (const m of tree.members) {
    const left = x.get(m.id)! - minX + PAD;
    pos[m.id] = { x: rtl ? width - left - NODE_W : left, y: PAD + rowOf.get(m.generation)! * ROW_H };
  }

  // Lines.
  const segments: Segment[] = [];
  const cousinLabels: Layout['cousinLabels'] = [];
  const midY = (id: string) => pos[id].y + NODE_H / 2;
  const between = (a: string, b: string) => {
    const [l, r] = pos[a].x <= pos[b].x ? [a, b] : [b, a];
    return { x1: pos[l].x + NODE_W, x2: pos[r].x, y: midY(a) };
  };
  const partnerPairs = new Set<string>();
  for (const l of tree.links) {
    if (l.type !== 'partner_of' || !sameRow(l.from, l.to)) continue;
    partnerPairs.add([l.from, l.to].sort().join(':'));
    const { x1, x2, y } = between(l.from, l.to);
    if (l.consanguineous) {
      segments.push({ d: `M${x1} ${y - 3}H${x2}M${x1} ${y + 3}H${x2}`, links: [l.id], kind: 'cousins' });
      // Below the boxes, so a long label ("أبناء عمومة") never covers a name.
      cousinLabels.push({ x: (x1 + x2) / 2, y: y + NODE_H / 2 + 4, link: l.id });
    } else {
      segments.push({ d: `M${x1} ${y}H${x2}`, links: [l.id], kind: 'partner' });
    }
  }
  for (const [a, b] of coparents) {
    const key = [a, b].sort().join(':');
    if (partnerPairs.has(key)) continue;
    partnerPairs.add(key);
    const { x1, x2, y } = between(a, b);
    segments.push({ d: `M${x1} ${y}H${x2}`, links: [], kind: 'coparent' });
  }

  // Children grouped by their set of parents, hung from the middle of the parents' link.
  const families = new Map<string, { parents: string[]; children: string[] }>();
  for (const m of tree.members) {
    const ps = (parentsOfId.get(m.id) ?? []).slice().sort();
    if (!ps.length) continue;
    const key = ps.join(':');
    const fam = families.get(key) ?? { parents: ps, children: [] };
    fam.children.push(m.id);
    families.set(key, fam);
  }
  const linkId = (from: string, to: string) => tree.links.find((l) => l.type === 'parent_of' && l.from === from && l.to === to)?.id ?? '';
  for (const { parents, children } of families.values()) {
    let sx: number;
    let sy: number;
    if (parents.length === 2 && sameRow(parents[0], parents[1])) {
      const { x1, x2, y } = between(parents[0], parents[1]);
      sx = (x1 + x2) / 2;
      sy = y;
    } else {
      sx = pos[parents[0]].x + NODE_W / 2;
      sy = pos[parents[0]].y + NODE_H;
    }
    const childTop = Math.min(...children.map((c) => pos[c].y));
    const barY = childTop - BAR_GAP;
    const centres = children.map((c) => pos[c].x + NODE_W / 2);
    const all = children.flatMap((c) => parents.map((p) => linkId(p, c))).filter(Boolean);
    const left = Math.min(sx, ...centres);
    const right = Math.max(sx, ...centres);
    segments.push({ d: `M${sx} ${sy}V${barY}${right > left ? `M${left} ${barY}H${right}` : ''}`, links: all, kind: 'child' });
    children.forEach((c, i) => {
      segments.push({ d: `M${centres[i]} ${barY}V${pos[c].y}`, links: parents.map((p) => linkId(p, c)).filter(Boolean), kind: 'child' });
    });
  }

  return { pos, width, height, segments, cousinLabels };
}
