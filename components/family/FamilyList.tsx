'use client';
/**
 * "List view" (task 13, section 5): the same family as a nested list, so
 * screen-reader users get the full tree. Generations, then each person with
 * their relation, conditions, partners and children.
 */
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { childrenOf, memberMap, parentsOf, partnerLink, partnersOf } from '@/lib/family/graph';
import type { Proposed } from '@/lib/family/proposal';
import type { Tree } from '@/lib/family/types';
import { focusRing } from './FamilyDialogs';
import { markerClass, markerFor, type useFamilyDisplay } from './display';

type Display = ReturnType<typeof useFamilyDisplay>;

export function FamilyList({
  tree,
  proposed,
  selectedId,
  onSelect,
  display,
}: {
  tree: Tree;
  proposed: Proposed;
  selectedId: string | null;
  onSelect: (id: string) => void;
  display: Display;
}) {
  const t = useTranslations('family');
  const format = useFormatter();
  const byId = memberMap(tree);
  const nameOf = (id: string) => {
    const m = byId.get(id);
    return m ? (m.placeholder ? `${display.relation(m)} (${t('tree.unknown')})` : display.name(m)) : '';
  };
  const list = (ids: string[]) => format.list(ids.map(nameOf), { type: 'conjunction' });
  const gens = [...new Set(tree.members.map((m) => m.generation))].sort((a, b) => a - b);

  return (
    <section aria-labelledby="family-list-title" data-testid="family-list">
      <h3 id="family-list-title" className="sr-only">
        {t('list.title')}
      </h3>
      <ul className="space-y-5">
        {gens.map((g) => (
          <li key={g}>
            <h4 className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('list.generation', { gen: g < 0 ? `g_${-g}` : `g${g}` })}
            </h4>
            <ul className="mt-2 space-y-2">
              {tree.members
                .filter((m) => m.generation === g)
                .map((m) => {
                  const rows = tree.conditions.filter((c) => c.memberId === m.id);
                  const partners = partnersOf(tree, m.id);
                  const kids = childrenOf(tree, m.id);
                  const parents = parentsOf(tree, m.id);
                  const cousins = partners.some((p) => partnerLink(tree, m.id, p)?.consanguineous);
                  const isProposed = proposed.members.has(m.id);
                  return (
                    <li key={m.id} data-person={m.id} className={cn('rounded-tile border bg-surface px-4 py-3', isProposed ? 'border-dashed border-brand' : 'border-line')}>
                      <button
                        type="button"
                        onClick={() => onSelect(m.id)}
                        aria-pressed={selectedId === m.id}
                        className={cn('flex min-h-11 w-full items-center gap-2.5 text-start', focusRing)}
                      >
                        <span aria-hidden className={cn('size-3 shrink-0 rounded-[3px] border', markerClass[markerFor(tree, m.id)])} />
                        <span className="min-w-0">
                          <span dir="auto" className="block text-sm font-bold">
                            {m.placeholder ? t('tree.unknown') : display.name(m)}
                          </span>
                          <span className="block text-xs text-muted">{display.relation(m)}</span>
                        </span>
                      </button>
                      <ul className="mt-1 list-disc space-y-0.5 ps-9 text-xs text-muted">
                        {rows.length ? (
                          rows.map((c) => (
                            <li key={c.id} dir="auto">
                              {display.conditionLine(c)}
                              {proposed.conditions.has(c.id) ? ` (${t('tree.new')})` : ''}
                            </li>
                          ))
                        ) : (
                          <li>{t('list.noCondition')}</li>
                        )}
                        {partners.length ? (
                          <li>
                            {t('list.partnerOf', { names: list(partners) })}
                            {cousins ? `, ${t('list.cousinsMark')}` : ''}
                          </li>
                        ) : null}
                        {parents.length ? <li>{t('list.childOf', { names: list(parents) })}</li> : null}
                        {kids.length ? <li>{t('list.parentOf', { names: list(kids) })}</li> : null}
                        {isProposed ? <li className="font-semibold text-brand-text">{t('list.proposed')}</li> : null}
                      </ul>
                    </li>
                  );
                })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
