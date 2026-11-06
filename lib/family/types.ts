/**
 * The family map (task 13). Self-reported and private to its owner. The same
 * shape is used in the browser, in the database (family_members,
 * family_links, family_member_conditions) and, without labels, in what the
 * describe pipeline sees.
 */

export const sides = ['paternal', 'maternal', 'none'] as const;
export type Side = (typeof sides)[number];

export const sexes = ['female', 'male', 'unknown'] as const;
export type Sex = (typeof sexes)[number];

export const linkTypes = ['parent_of', 'partner_of'] as const;
export type LinkType = (typeof linkTypes)[number];

export const conditionStatuses = ['known', 'carrier', 'not_sure'] as const;
export type ConditionStatus = (typeof conditionStatuses)[number];

export type CreatedBy = 'manual' | 'ai';

export type Member = {
  id: string;
  /**
   * The name or nickname the owner typed, or null to show the relation
   * ("Father"). Never sent to the AI.
   */
  label: string | null;
  /** A key from lib/family/relations.ts, relative to the owner. */
  relation: string;
  side: Side;
  sex: Sex;
  /** Relative to the owner: parents -1, children +1. */
  generation: number;
  deceased: boolean;
  createdBy: CreatedBy;
  isOwner: boolean;
  /** An "unknown" connector added only so the tree can be drawn. */
  placeholder: boolean;
};

export type Link = {
  id: string;
  from: string;
  to: string;
  type: LinkType;
  /** partner_of only: a marriage between cousins (drawn as a double line). */
  consanguineous: boolean;
};

export type MemberCondition = {
  id: string;
  memberId: string;
  /** A catalogue id, or null for "Other: <their words>". */
  conditionId: string | null;
  otherText: string | null;
  status: ConditionStatus;
  source: CreatedBy;
};

export type Tree = {
  members: Member[];
  links: Link[];
  conditions: MemberCondition[];
};

export const MAX_PEOPLE = 60;
export const MAX_DESCRIBE_CHARS = 1000;
export const DESCRIBE_HOURLY_LIMIT = 30;
export const MAX_QUESTIONS_PER_TURN = 2;

export function emptyTree(): Tree {
  return { members: [], links: [], conditions: [] };
}

export function ownerOf(tree: Tree): Member | undefined {
  return tree.members.find((m) => m.isOwner);
}
