/**
 * Kinship words, always relative to the owner of the map. Each relation
 * implies a generation and often a sex (an uncle is male); the side of the
 * family (paternal / maternal) is stored separately. Arabic words are more
 * precise than English ones (عم = father's brother), so the side matters
 * for uncles, aunts, grandparents and cousins.
 */
import type { Sex, Side } from './types';

export type RelationInfo = {
  generation: number;
  sex: Sex;
  /** The side of the family is meaningful (and must be known) for this relation. */
  sided: boolean;
};

export const relationInfo = {
  self: { generation: 0, sex: 'unknown', sided: false },
  father: { generation: -1, sex: 'male', sided: false },
  mother: { generation: -1, sex: 'female', sided: false },
  parent: { generation: -1, sex: 'unknown', sided: false },
  brother: { generation: 0, sex: 'male', sided: false },
  sister: { generation: 0, sex: 'female', sided: false },
  sibling: { generation: 0, sex: 'unknown', sided: false },
  son: { generation: 1, sex: 'male', sided: false },
  daughter: { generation: 1, sex: 'female', sided: false },
  child: { generation: 1, sex: 'unknown', sided: false },
  husband: { generation: 0, sex: 'male', sided: false },
  wife: { generation: 0, sex: 'female', sided: false },
  partner: { generation: 0, sex: 'unknown', sided: false },
  grandfather: { generation: -2, sex: 'male', sided: true },
  grandmother: { generation: -2, sex: 'female', sided: true },
  grandparent: { generation: -2, sex: 'unknown', sided: true },
  uncle: { generation: -1, sex: 'male', sided: true },
  aunt: { generation: -1, sex: 'female', sided: true },
  uncle_or_aunt: { generation: -1, sex: 'unknown', sided: true },
  cousin: { generation: 0, sex: 'unknown', sided: true },
  nephew: { generation: 1, sex: 'male', sided: false },
  niece: { generation: 1, sex: 'female', sided: false },
  sibling_child: { generation: 1, sex: 'unknown', sided: false },
  grandson: { generation: 2, sex: 'male', sided: false },
  granddaughter: { generation: 2, sex: 'female', sided: false },
  grandchild: { generation: 2, sex: 'unknown', sided: false },
  partner_father: { generation: -1, sex: 'male', sided: false },
  partner_mother: { generation: -1, sex: 'female', sided: false },
  partner_parent: { generation: -1, sex: 'unknown', sided: false },
  relative: { generation: 0, sex: 'unknown', sided: false },
} as const satisfies Record<string, RelationInfo>;

export type Relation = keyof typeof relationInfo;

export const relations = Object.keys(relationInfo) as Relation[];

export function isRelation(value: unknown): value is Relation {
  return typeof value === 'string' && Object.hasOwn(relationInfo, value);
}

export function infoFor(relation: string): RelationInfo {
  return isRelation(relation) ? relationInfo[relation] : relationInfo.relative;
}

/** The key used for the display label ("Father", "Uncle (father's side)"). */
export function relationLabelKey(relation: string, side: Side, sex: Sex): string {
  const rel = isRelation(relation) ? relation : 'relative';
  // A relation with no sex in its word gets a gendered label once the sex is known.
  const gendered: Partial<Record<Relation, Record<'male' | 'female', Relation>>> = {
    parent: { male: 'father', female: 'mother' },
    sibling: { male: 'brother', female: 'sister' },
    child: { male: 'son', female: 'daughter' },
    partner: { male: 'husband', female: 'wife' },
    grandparent: { male: 'grandfather', female: 'grandmother' },
    uncle_or_aunt: { male: 'uncle', female: 'aunt' },
    sibling_child: { male: 'nephew', female: 'niece' },
    grandchild: { male: 'grandson', female: 'granddaughter' },
    partner_parent: { male: 'partner_father', female: 'partner_mother' },
  };
  const base = sex !== 'unknown' ? (gendered[rel]?.[sex] ?? rel) : rel;
  return relationInfo[base].sided && side !== 'none' ? `${base}_${side}` : base;
}

/** Relations that make two people partners of each other. */
export const partnerRelations: ReadonlySet<Relation> = new Set(['husband', 'wife', 'partner']);
