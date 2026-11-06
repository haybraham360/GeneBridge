/**
 * Turns describe operations (from the model or the rule-based planner) into
 * proposed changes on the family tree (task 13, section 4 steps 5–6).
 *
 * Every operation is checked with zod first (schema.ts), then applied to a
 * copy of the tree and kept only if lib/family/validate.ts still passes.
 * A rejected operation returns a reason the planner can act on (fix it, or
 * ask the person). Our code, not the model, decides:
 *   - the generation and, where the word says it, the sex of each relation;
 *   - the links that place a relative (a father is a parent of the owner,
 *     a paternal uncle is a child of the father's parents);
 *   - "unknown" placeholder connectors, added only when a relative can't be
 *     drawn without them, and reused when the real person is described;
 *   - the condition, through the catalogue matcher;
 *   - whether two partners are cousins (kinship.ts).
 * Nothing here is saved: the browser shows the result as proposed changes.
 */
import { matchFamilyCondition, hedgedStatus } from '../conditions';
import { diffTrees } from '../diff';
import { childrenOf, hasLink, memberMap, parentsOf, partnersOf, removeMember, siblingsOf } from '../graph';
import { markConsanguinity } from '../kinship';
import { infoFor, type Relation } from '../relations';
import { MAX_PEOPLE, MAX_QUESTIONS_PER_TURN, type Member, type Sex, type Side, type Tree } from '../types';
import { describeProblem, validateTree } from '../validate';
import type { Change, Op, Question } from './schema';

export type ApplyContext = {
  tree: Tree;
  readonly start: Tree;
  ownerId: string;
  /** Member id → [PERSON_n] token, for people whose name was masked. */
  tokens: Map<string, string>;
  /** The planner's temp ids → member ids. */
  temp: Map<string, string>;
  questions: Question[];
  /** People whose connecting links are filled in at the end of the turn. */
  deferred: Set<string>;
  consanguinityMarked: number;
  rejected: number;
  done: boolean;
  uuid: () => string;
  emit: (change: Change) => void;
};

export type OpResult = { ok: true; note?: string } | { ok: false; error: string };

export function createContext(
  tree: Tree,
  tokens: Map<string, string>,
  emit: (c: Change) => void,
  uuid: () => string = () => crypto.randomUUID(),
): ApplyContext {
  const owner = tree.members.find((m) => m.isOwner);
  if (!owner) throw new Error('The tree has no owner node.');
  return {
    tree,
    start: tree,
    ownerId: owner.id,
    tokens,
    temp: new Map(),
    questions: [],
    deferred: new Set(),
    consanguinityMarked: 0,
    rejected: 0,
    done: false,
    uuid,
    emit,
  };
}

class Reject extends Error {}

/* ------------------------------ Tree editing ------------------------------ */

function withMember(tree: Tree, member: Member): Tree {
  const exists = tree.members.some((m) => m.id === member.id);
  return {
    ...tree,
    members: exists ? tree.members.map((m) => (m.id === member.id ? member : m)) : [...tree.members, member],
  };
}

function link(ctx: ApplyContext, tree: Tree, from: string, to: string, type: 'parent_of' | 'partner_of', consanguineous = false): Tree {
  if (hasLink(tree, from, to, type)) return tree;
  if (type === 'parent_of' && parentsOf(tree, to).length >= 2) {
    throw new Reject('That person already has two parents on the map.');
  }
  return { ...tree, links: [...tree.links, { id: ctx.uuid(), from, to, type, consanguineous }] };
}

function placeholder(ctx: ApplyContext, relation: Relation, side: Side, sex: Sex): Member {
  return {
    id: ctx.uuid(),
    label: null,
    relation,
    side,
    sex,
    generation: infoFor(relation).generation,
    deceased: false,
    createdBy: 'ai',
    isOwner: false,
    placeholder: true,
  };
}

const compatible = (a: Sex, b: Sex) => a === 'unknown' || b === 'unknown' || a === b;

/** Repoints every link of a placeholder to the real person, then removes the placeholder. */
function mergeInto(tree: Tree, placeholderId: string, realId: string): Tree {
  const links = tree.links
    .map((l) => ({ ...l, from: l.from === placeholderId ? realId : l.from, to: l.to === placeholderId ? realId : l.to }))
    .filter((l) => l.from !== l.to);
  const seen = new Set<string>();
  const unique = links.filter((l) => {
    const key = l.type === 'partner_of' ? `p:${[l.from, l.to].sort().join(':')}` : `c:${l.from}:${l.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const conditions = tree.conditions.map((c) => (c.memberId === placeholderId ? { ...c, memberId: realId } : c));
  return removeMember({ ...tree, links: unique, conditions }, placeholderId);
}

/** The owner's parent on one side (father for paternal), created as a placeholder if needed. */
function parentOnSide(ctx: ApplyContext, tree: Tree, side: Side): { tree: Tree; id: string } {
  const sex: Sex = side === 'paternal' ? 'male' : 'female';
  const byId = memberMap(tree);
  const parents = parentsOf(tree, ctx.ownerId).map((id) => byId.get(id)!);
  const exact = parents.find((p) => p.sex === sex);
  if (exact) return { tree, id: exact.id };
  const unknown = parents.find((p) => p.placeholder && p.sex === 'unknown');
  const relation: Relation = sex === 'male' ? 'father' : 'mother';
  if (unknown) {
    return { tree: withMember(tree, { ...unknown, sex, relation }), id: unknown.id };
  }
  const ph = placeholder(ctx, relation, 'none', sex);
  const next = link(ctx, withMember(tree, ph), ph.id, ctx.ownerId, 'parent_of');
  return { tree: next, id: ph.id };
}

function ensureParents(ctx: ApplyContext, tree: Tree, of: string, relation: Relation, side: Side): { tree: Tree; ids: string[] } {
  const existing = parentsOf(tree, of);
  if (existing.length) return { tree, ids: existing };
  const ph = placeholder(ctx, relation, side, 'unknown');
  return { tree: link(ctx, withMember(tree, ph), ph.id, of, 'parent_of'), ids: [ph.id] };
}

type Base =
  | 'parent'
  | 'sibling'
  | 'child'
  | 'partner'
  | 'grandparent'
  | 'uncle_or_aunt'
  | 'cousin'
  | 'sibling_child'
  | 'grandchild'
  | 'partner_parent'
  | 'relative';

function baseOf(relation: string): Base {
  switch (relation) {
    case 'father':
    case 'mother':
    case 'parent':
      return 'parent';
    case 'brother':
    case 'sister':
    case 'sibling':
      return 'sibling';
    case 'son':
    case 'daughter':
    case 'child':
      return 'child';
    case 'husband':
    case 'wife':
    case 'partner':
      return 'partner';
    case 'grandfather':
    case 'grandmother':
    case 'grandparent':
      return 'grandparent';
    case 'uncle':
    case 'aunt':
    case 'uncle_or_aunt':
      return 'uncle_or_aunt';
    case 'cousin':
      return 'cousin';
    case 'nephew':
    case 'niece':
    case 'sibling_child':
      return 'sibling_child';
    case 'grandson':
    case 'granddaughter':
    case 'grandchild':
      return 'grandchild';
    case 'partner_father':
    case 'partner_mother':
    case 'partner_parent':
      return 'partner_parent';
    default:
      return 'relative';
  }
}

/** Relations whose parent is often named later in the same description ("Khalid is Saeed's son"). */
const DEFERRED: ReadonlySet<Base> = new Set(['cousin', 'sibling_child', 'grandchild', 'partner_parent']);

/** A placeholder already standing where this relative belongs, to turn into them. */
function placeholderSlot(ctx: ApplyContext, tree: Tree, relation: string, side: Side, sex: Sex): Member | null {
  const byId = memberMap(tree);
  const base = baseOf(relation);
  const ph = (ids: string[]) =>
    ids.map((id) => byId.get(id)!).find((m) => m.placeholder && compatible(m.sex, sex)) ?? null;
  switch (base) {
    case 'parent':
      return ph(parentsOf(tree, ctx.ownerId));
    case 'grandparent': {
      const parent = parentsOf(tree, ctx.ownerId)
        .map((id) => byId.get(id)!)
        .find((p) => p.sex === (side === 'paternal' ? 'male' : 'female'));
      return parent ? ph(parentsOf(tree, parent.id)) : null;
    }
    case 'uncle_or_aunt':
      return tree.members.find((m) => m.placeholder && baseOf(m.relation) === 'uncle_or_aunt' && m.side === side && compatible(m.sex, sex)) ?? null;
    case 'sibling':
      return ph(siblingsOf(tree, ctx.ownerId));
    case 'child':
      return ph(childrenOf(tree, ctx.ownerId));
    default:
      return null;
  }
}

/** Adds the links (and only the placeholder connectors needed) that place `id` relative to the owner. */
function connect(ctx: ApplyContext, tree: Tree, id: string, final: boolean): Tree {
  const me = ctx.ownerId;
  const person = memberMap(tree).get(id);
  if (!person || person.isOwner) return tree;
  const base = baseOf(person.relation);
  if (DEFERRED.has(base) && !final) {
    ctx.deferred.add(id);
    return tree;
  }
  switch (base) {
    case 'parent':
      return link(ctx, tree, id, me, 'parent_of');
    case 'child':
      return link(ctx, tree, me, id, 'parent_of');
    case 'partner':
      return link(ctx, tree, me, id, 'partner_of');
    case 'sibling': {
      if (parentsOf(tree, id).length) return tree;
      const { tree: t, ids } = ensureParents(ctx, tree, me, 'parent', 'none');
      return ids.reduce((acc, p) => link(ctx, acc, p, id, 'parent_of'), t);
    }
    case 'grandparent': {
      if (childrenOf(tree, id).length) return tree;
      const { tree: t, id: parent } = parentOnSide(ctx, tree, person.side);
      return link(ctx, t, id, parent, 'parent_of');
    }
    case 'uncle_or_aunt': {
      if (parentsOf(tree, id).length) return tree;
      const { tree: t1, id: parent } = parentOnSide(ctx, tree, person.side);
      const { tree: t2, ids } = ensureParents(ctx, t1, parent, 'grandparent', person.side);
      return ids.reduce((acc, gp) => link(ctx, acc, gp, id, 'parent_of'), t2);
    }
    case 'cousin': {
      if (parentsOf(tree, id).length) return tree;
      const ph = placeholder(ctx, 'uncle_or_aunt', person.side, 'unknown');
      const t = connect(ctx, withMember(tree, ph), ph.id, true);
      return link(ctx, t, ph.id, id, 'parent_of');
    }
    case 'sibling_child': {
      if (parentsOf(tree, id).length) return tree;
      const ph = placeholder(ctx, 'sibling', 'none', 'unknown');
      const t = connect(ctx, withMember(tree, ph), ph.id, true);
      return link(ctx, t, ph.id, id, 'parent_of');
    }
    case 'grandchild': {
      if (parentsOf(tree, id).length) return tree;
      const ph = placeholder(ctx, 'child', 'none', 'unknown');
      const t = connect(ctx, withMember(tree, ph), ph.id, true);
      return link(ctx, t, ph.id, id, 'parent_of');
    }
    case 'partner_parent': {
      if (childrenOf(tree, id).length) return tree;
      const partners = partnersOf(tree, me);
      // Only when it's clear whose parent they are.
      return partners.length === 1 ? link(ctx, tree, id, partners[0], 'parent_of') : tree;
    }
    default:
      return tree;
  }
}

/* -------------------------------- Committing ------------------------------- */

/** Keeps `next` only if the tree stays valid, then streams what changed. */
function commit(ctx: ApplyContext, next: Tree): void {
  const marked = markConsanguinity(next);
  const problems = validateTree(marked.tree);
  if (problems.length) throw new Reject(describeProblem(problems[0]));
  ctx.consanguinityMarked += marked.marked.length;
  const d = diffTrees(ctx.tree, marked.tree);
  ctx.tree = marked.tree;
  for (const member of d.upsert.members) ctx.emit({ kind: 'member', member, token: ctx.tokens.get(member.id) ?? null });
  for (const l of d.upsert.links) ctx.emit({ kind: 'link', link: l });
  for (const c of d.upsert.conditions) ctx.emit({ kind: 'condition', condition: c });
  for (const id of d.remove.links) ctx.emit({ kind: 'remove', what: 'link', id });
  for (const id of d.remove.conditions) ctx.emit({ kind: 'remove', what: 'condition', id });
  for (const id of d.remove.members) {
    ctx.emit({ kind: 'remove', what: 'member', id });
    ctx.deferred.delete(id);
  }
}

function resolve(ctx: ApplyContext, ref: string): string | null {
  if (ref === 'self' || ref === 'owner' || ref === 'me') return ctx.ownerId;
  const temp = ctx.temp.get(ref);
  if (temp && ctx.tree.members.some((m) => m.id === temp)) return temp;
  if (ctx.tree.members.some((m) => m.id === ref)) return ref;
  const bracketed = /^PERSON_\d{1,2}$/.test(ref) ? `[${ref}]` : ref;
  for (const [id, token] of ctx.tokens) if (token === bracketed) return id;
  return null;
}

function addQuestion(ctx: ApplyContext, question: Question): boolean {
  if (ctx.questions.length >= MAX_QUESTIONS_PER_TURN) return false;
  ctx.questions.push(question);
  ctx.emit({ kind: 'question', question });
  return true;
}

/* ------------------------------- Operations ------------------------------- */

function addPerson(ctx: ApplyContext, input: Extract<Op, { tool: 'add_person' }>['input']): OpResult {
  if (ctx.temp.has(input.temp_id)) return { ok: false, error: `temp_id ${input.temp_id} is already used.` };
  const info = infoFor(input.relation_hint);
  const side: Side = info.sided ? input.side : 'none';
  if (info.sided && side === 'none') {
    return { ok: false, error: `It is not clear which side of the family this ${input.relation_hint} is on. Do not add them; ask the user (father's side or mother's side).` };
  }
  const sex: Sex = info.sex !== 'unknown' ? info.sex : input.sex;
  const generation = input.relation_hint === 'relative' ? input.generation : info.generation;

  // The same masked name already on the map: it's the same person.
  if (input.label_token) {
    for (const [id, token] of ctx.tokens) {
      if (token === input.label_token && ctx.tree.members.some((m) => m.id === id)) {
        ctx.temp.set(input.temp_id, id);
        return { ok: true, note: `${input.label_token} is already on the map as ${id}; use that id.` };
      }
    }
  }
  const slot = placeholderSlot(ctx, ctx.tree, input.relation_hint, side, sex);
  if (!slot && ctx.tree.members.length >= MAX_PEOPLE) {
    return { ok: false, error: `The family map holds at most ${MAX_PEOPLE} people. Do not add more.` };
  }
  const member: Member = slot
    ? { ...slot, relation: input.relation_hint, side, sex: sex === 'unknown' ? slot.sex : sex, placeholder: false, createdBy: 'ai' }
    : {
        id: ctx.uuid(),
        label: null,
        relation: input.relation_hint,
        side,
        sex,
        generation,
        deceased: false,
        createdBy: 'ai',
        isOwner: false,
        placeholder: false,
      };
  if (input.label_token) ctx.tokens.set(member.id, input.label_token);
  try {
    commit(ctx, connect(ctx, withMember(ctx.tree, member), member.id, false));
  } catch (error) {
    ctx.tokens.delete(member.id);
    if (error instanceof Reject) return { ok: false, error: error.message };
    throw error;
  }
  ctx.temp.set(input.temp_id, member.id);
  return { ok: true, note: `Added as ${member.id}.` };
}

function addLink(ctx: ApplyContext, input: Extract<Op, { tool: 'add_link' }>['input']): OpResult {
  const from = resolve(ctx, input.from);
  const to = resolve(ctx, input.to);
  if (!from || !to) return { ok: false, error: 'Both people must be on the map (use their id or temp_id).' };
  if (from === to) return { ok: false, error: 'A person cannot be linked to themselves.' };
  let tree = ctx.tree;
  if (input.type === 'parent_of') {
    if (hasLink(tree, from, to, 'parent_of')) return { ok: true, note: 'Already linked.' };
    const byId = memberMap(tree);
    const parent = byId.get(from)!;
    // A placeholder parent in the way becomes the named parent.
    const ph = parentsOf(tree, to)
      .map((id) => byId.get(id)!)
      .find((p) => p.placeholder && p.id !== from && compatible(p.sex, parent.sex));
    if (ph && !parent.placeholder) {
      tree = mergeInto(tree, ph.id, parent.id);
      // The named parent keeps the placeholder's sex if theirs was unknown.
      if (parent.sex === 'unknown' && ph.sex !== 'unknown') tree = withMember(tree, { ...parent, sex: ph.sex });
    } else {
      tree = { ...tree, links: [...tree.links, { id: ctx.uuid(), from, to, type: 'parent_of', consanguineous: false }] };
    }
  } else {
    if (hasLink(tree, from, to, 'partner_of')) {
      if (!input.consanguineous) return { ok: true, note: 'Already linked.' };
      tree = { ...tree, links: tree.links.map((l) => (l.type === 'partner_of' && [l.from, l.to].includes(from) && [l.from, l.to].includes(to) ? { ...l, consanguineous: true } : l)) };
    } else {
      // Marked as cousins only when the person said so; otherwise kinship.ts works it out.
      tree = { ...tree, links: [...tree.links, { id: ctx.uuid(), from, to, type: 'partner_of', consanguineous: input.consanguineous }] };
    }
  }
  try {
    commit(ctx, tree);
  } catch (error) {
    if (error instanceof Reject) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true };
}

function addCondition(ctx: ApplyContext, input: Extract<Op, { tool: 'add_condition' }>['input']): OpResult {
  const memberId = resolve(ctx, input.person);
  if (!memberId) return { ok: false, error: 'That person is not on the map yet. Add them first.' };
  const match = matchFamilyCondition(input.condition_query);
  if (!match.words) return { ok: false, error: 'The condition description is empty.' };
  const stated = hedgedStatus(input.condition_query, input.status);
  const existing = ctx.tree.conditions.filter((c) => c.memberId === memberId);

  if (match.conditionId) {
    const same = existing.find((c) => c.conditionId === match.conditionId);
    const row = same
      ? { ...same, status: stated }
      : { id: ctx.uuid(), memberId, conditionId: match.conditionId, otherText: null, status: stated, source: 'ai' as const };
    commit(ctx, { ...ctx.tree, conditions: same ? ctx.tree.conditions.map((c) => (c.id === row.id ? row : c)) : [...ctx.tree.conditions, row] });
    return { ok: true, note: `Matched to the catalogue (${match.conditionId}).` };
  }

  const sameOther = existing.find((c) => c.conditionId === null && c.otherText === match.words);
  if (sameOther) return { ok: true, note: 'Already recorded.' };
  const row = { id: ctx.uuid(), memberId, conditionId: null, otherText: match.words, status: 'not_sure' as const, source: 'ai' as const };
  commit(ctx, { ...ctx.tree, conditions: [...ctx.tree.conditions, row] });
  if (match.candidates.length) {
    const asked = addQuestion(ctx, {
      id: ctx.uuid(),
      kind: 'condition_match',
      memberId,
      conditionRowId: row.id,
      candidates: match.candidates,
      statedStatus: stated,
    });
    return {
      ok: true,
      note: asked
        ? 'Recorded as "Other", status not sure. GeneBridge is already asking the user which catalogue condition it is: do not ask about this condition yourself.'
        : 'Recorded as "Other", status not sure.',
    };
  }
  return { ok: true, note: 'Not in the catalogue: recorded as "Other", status not sure.' };
}

function updatePerson(ctx: ApplyContext, input: Extract<Op, { tool: 'update_person' }>['input']): OpResult {
  const id = resolve(ctx, input.id);
  if (!id) return { ok: false, error: 'That person is not on the map.' };
  const person = memberMap(ctx.tree).get(id)!;
  if (person.isOwner) return { ok: false, error: 'The owner cannot be changed this way.' };
  const f = input.fields;
  const relation = f.relation_hint ?? person.relation;
  const info = infoFor(relation);
  const side: Side = info.sided ? (f.side ?? (person.side !== 'none' ? person.side : 'none')) : 'none';
  if (info.sided && side === 'none') return { ok: false, error: 'Ask the user which side of the family first.' };
  const sex: Sex = info.sex !== 'unknown' ? info.sex : (f.sex ?? person.sex);
  const updated: Member = {
    ...person,
    relation,
    side,
    sex,
    generation: relation === 'relative' ? person.generation : info.generation,
    deceased: f.deceased ?? person.deceased,
    placeholder: false,
  };
  if (f.label_token) ctx.tokens.set(id, f.label_token);
  try {
    let tree = withMember(ctx.tree, updated);
    // A new relation or side may need new connecting links, when none exist yet.
    if (f.relation_hint || f.side) {
      const hasLinks = tree.links.some((l) => l.from === id || l.to === id);
      if (!hasLinks) tree = connect(ctx, tree, id, false);
    }
    commit(ctx, tree);
  } catch (error) {
    if (error instanceof Reject) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true };
}

/** Applies one checked operation. Never throws for a bad operation: it returns the reason. */
export function applyOp(ctx: ApplyContext, op: Op): OpResult {
  let result: OpResult;
  switch (op.tool) {
    case 'add_person':
      result = addPerson(ctx, op.input);
      break;
    case 'add_link':
      result = addLink(ctx, op.input);
      break;
    case 'add_condition':
      result = addCondition(ctx, op.input);
      break;
    case 'update_person':
      result = updatePerson(ctx, op.input);
      break;
    case 'ask_user':
      result = addQuestion(ctx, { id: ctx.uuid(), kind: 'model', text: op.input.question, choices: op.input.choices })
        ? { ok: true }
        : { ok: false, error: `At most ${MAX_QUESTIONS_PER_TURN} questions per turn. Keep the most important ones.` };
      break;
    case 'done':
      ctx.done = true;
      result = { ok: true };
      break;
  }
  if (!result.ok) ctx.rejected += 1;
  return result;
}

/** End of turn: place anyone still waiting for their connecting links. */
export function finishTurn(ctx: ApplyContext): void {
  for (const id of [...ctx.deferred]) {
    ctx.deferred.delete(id);
    try {
      commit(ctx, connect(ctx, ctx.tree, id, true));
    } catch (error) {
      if (!(error instanceof Reject)) throw error;
    }
  }
}

export function turnCounts(ctx: ApplyContext) {
  const before = new Set(ctx.start.members.map((m) => m.id));
  const added = ctx.tree.members.filter((m) => !before.has(m.id) || (!m.placeholder && ctx.start.members.find((s) => s.id === m.id)?.placeholder));
  const linksBefore = new Set(ctx.start.links.map((l) => l.id));
  const conditionsBefore = new Set(ctx.start.conditions.map((c) => c.id));
  return {
    people: added.filter((m) => !m.placeholder).length,
    placeholders: added.filter((m) => m.placeholder).length,
    links: ctx.tree.links.filter((l) => !linksBefore.has(l.id)).length,
    conditions: ctx.tree.conditions.filter((c) => !conditionsBefore.has(c.id)).length,
    questions: ctx.questions.length,
    consanguinity: ctx.consanguinityMarked,
    rejected: ctx.rejected,
  };
}
