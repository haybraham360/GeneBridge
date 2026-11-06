import 'server-only';
/**
 * Reading and saving the family map, as the signed-in owner (row-level
 * security applies: owner only). Saving goes through public.family_save,
 * one transaction, after the whole resulting tree passes validate.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyDiff, type TreeDiff } from './diff';
import { isRelation } from './relations';
import { conditionStatuses, sexes, sides, type ConditionStatus, type Sex, type Side, type Tree } from './types';
import { validateTree, type GraphProblem } from './validate';

type MemberRow = {
  id: string;
  label: string | null;
  relation_to_owner: string;
  side: string;
  sex: string;
  generation: number;
  deceased: boolean;
  created_by: string;
  is_owner: boolean;
  placeholder: boolean;
};
type LinkRow = { id: string; from_member: string; to_member: string; type: string; consanguineous: boolean };
type ConditionRow = { id: string; member_id: string; condition_id: string | null; other_text: string | null; status: string; source: string };

const pick = <T extends string>(list: readonly T[], value: string, fallback: T): T =>
  (list as readonly string[]).includes(value) ? (value as T) : fallback;

/** The owner's tree. Creates their own node ("You") the first time. Null if the tables aren't there yet. */
export async function loadFamilyTree(supabase: SupabaseClient, userId: string): Promise<Tree | null> {
  const load = () =>
    Promise.all([
      supabase.from('family_members').select('id,label,relation_to_owner,side,sex,generation,deceased,created_by,is_owner,placeholder').eq('owner_id', userId),
      supabase.from('family_links').select('id,from_member,to_member,type,consanguineous').eq('owner_id', userId),
      supabase.from('family_member_conditions').select('id,member_id,condition_id,other_text,status,source').eq('owner_id', userId),
    ]);
  let [members, links, conditions] = await load();
  if (members.error || links.error || conditions.error) {
    console.warn('family map load failed', members.error?.code ?? links.error?.code ?? conditions.error?.code);
    return null;
  }
  if (!(members.data as MemberRow[]).some((m) => m.is_owner)) {
    const { error } = await supabase.from('family_members').insert({ owner_id: userId, relation_to_owner: 'self', is_owner: true, generation: 0 });
    // A unique-index race with another tab is fine: the node exists either way.
    if (error && error.code !== '23505') {
      console.warn('family owner node failed', error.code);
      return null;
    }
    [members, links, conditions] = await load();
  }

  return {
    members: (members.data as MemberRow[]).map((m) => ({
      id: m.id,
      label: m.label,
      relation: m.is_owner ? 'self' : isRelation(m.relation_to_owner) ? m.relation_to_owner : 'relative',
      side: pick<Side>(sides, m.side, 'none'),
      sex: pick<Sex>(sexes, m.sex, 'unknown'),
      generation: m.generation,
      deceased: m.deceased,
      createdBy: m.created_by === 'ai' ? 'ai' : 'manual',
      isOwner: m.is_owner,
      placeholder: m.placeholder,
    })),
    links: ((links.data ?? []) as LinkRow[]).map((l) => ({
      id: l.id,
      from: l.from_member,
      to: l.to_member,
      type: l.type === 'partner_of' ? 'partner_of' : 'parent_of',
      consanguineous: l.consanguineous,
    })),
    conditions: ((conditions.data ?? []) as ConditionRow[]).map((c) => ({
      id: c.id,
      memberId: c.member_id,
      conditionId: c.condition_id,
      otherText: c.other_text,
      status: pick<ConditionStatus>(conditionStatuses, c.status, 'not_sure'),
      source: c.source === 'ai' ? 'ai' : 'manual',
    })),
  };
}

export type SaveResult = { status: 'saved'; tree: Tree } | { status: 'invalid'; problem: GraphProblem['code'] } | { status: 'error' };

/** Saves a set of changes the owner kept or made by hand. The whole resulting tree must be valid. */
export async function saveFamilyDiff(supabase: SupabaseClient, userId: string, diff: TreeDiff): Promise<SaveResult> {
  const current = await loadFamilyTree(supabase, userId);
  if (!current) return { status: 'error' };
  const owner = current.members.find((m) => m.isOwner)!;
  // The owner node can't be removed or turned into someone else.
  const safe: TreeDiff = {
    upsert: {
      ...diff.upsert,
      members: diff.upsert.members.map((m) =>
        m.id === owner.id ? { ...m, isOwner: true, relation: 'self', generation: 0, side: 'none', placeholder: false } : { ...m, isOwner: false },
      ),
    },
    remove: { ...diff.remove, members: diff.remove.members.filter((id) => id !== owner.id) },
  };
  const next = applyDiff(current, safe);
  const problems = validateTree(next);
  if (problems.length) return { status: 'invalid', problem: problems[0].code };

  const { error } = await supabase.rpc('family_save', {
    p: {
      upsert: {
        members: safe.upsert.members.map((m) => ({
          id: m.id,
          label: m.label,
          relation: m.relation,
          side: m.side,
          sex: m.sex,
          generation: m.generation,
          deceased: m.deceased,
          created_by: m.createdBy,
          placeholder: m.placeholder,
        })),
        links: safe.upsert.links.map((l) => ({ id: l.id, from_member: l.from, to_member: l.to, type: l.type, consanguineous: l.consanguineous })),
        conditions: safe.upsert.conditions.map((c) => ({
          id: c.id,
          member_id: c.memberId,
          condition_id: c.conditionId,
          other_text: c.otherText,
          status: c.status,
          source: c.source,
        })),
      },
      remove: safe.remove,
    },
  });
  if (error) {
    console.warn('family save failed', error.code);
    return { status: 'error' };
  }
  return { status: 'saved', tree: next };
}
