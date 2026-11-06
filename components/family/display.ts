'use client';
/** How people, relations and conditions are written on the family map. Browser only. */
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { relationLabelKey } from '@/lib/family/relations';
import type { ConditionStatus, Member, MemberCondition, Tree } from '@/lib/family/types';

export type CatalogueItem = { id: string; title: string };

/** The marker square: a status always comes with a text label too, never colour alone. */
export type Marker = 'known' | 'carrier' | 'not_sure' | 'none';

export const markerClass: Record<Marker, string> = {
  known: 'border-affected bg-affected',
  carrier: 'border-brand bg-brand',
  not_sure: 'border-neutral-line bg-surface',
  none: 'border-neutral-fill bg-neutral-fill',
};

const rank: Record<ConditionStatus, number> = { known: 3, carrier: 2, not_sure: 1 };

export function markerFor(tree: Tree, memberId: string): Marker {
  const rows = tree.conditions.filter((c) => c.memberId === memberId);
  if (!rows.length) return 'none';
  return rows.reduce((best, c) => (rank[c.status] > rank[best.status] ? c : best)).status;
}

export function useFamilyDisplay(catalogue: CatalogueItem[], selfName: string | null) {
  const t = useTranslations('family');
  const titles = new Map(catalogue.map((c) => [c.id, c.title]));

  const relation = useCallback(
    (m: Member) => (m.isOwner ? t('relation.self') : t(`relation.${relationLabelKey(m.relation, m.side, m.sex)}` as 'relation.relative')),
    [t],
  );

  const name = useCallback(
    (m: Member) => {
      if (m.isOwner) return selfName ?? t('relation.self');
      if (m.label) return m.label;
      return relation(m);
    },
    [relation, selfName, t],
  );

  const conditionName = useCallback(
    (c: MemberCondition) =>
      c.conditionId ? (titles.get(c.conditionId) ?? c.conditionId) : t('condition.other', { words: c.otherText ?? '' }),
    // titles is rebuilt from the same props each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogue, t],
  );

  const status = useCallback((s: ConditionStatus) => t(`condition.status.${s}`), [t]);

  const conditionLine = useCallback(
    (c: MemberCondition) => t('condition.line', { condition: conditionName(c), status: status(c.status) }),
    [conditionName, status, t],
  );

  return {
    relation,
    name,
    conditionName,
    conditionLine,
    status,
    more: (count: number) => t('condition.more', { count }),
    title: (id: string) => titles.get(id) ?? id,
  };
}
