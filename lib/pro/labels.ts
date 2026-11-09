/**
 * Display text for the counsellor workspace, shared by server pages and
 * client components. Takes a translator for the `pro` namespace.
 *
 * Wording follows the design (design/screens/Pro.html). Labels follow the
 * sharing rules: first names only for couples who shared, otherwise
 * "Patient" plus an initial.
 */
import type {
  PersonDetail,
  PersonLabel,
  RequestDetail,
  RequestRow,
  Resource,
  SharedResult,
} from './types';
import { resources } from './types';

/** A next-intl translator for the `pro` namespace, loosely typed for dynamic keys. */
export type Translate = ((key: string, values?: Record<string, string | number>) => string) & {
  has?: (key: string) => boolean;
};

export function proLabels(t: Translate) {
  const list = (items: string[]) => items.join(t('labels.listSeparator'));

  const person = (p: PersonLabel) => p.firstName ?? t('labels.patient', { initial: p.initial });

  const request = (r: { user: PersonLabel; partner: PersonLabel | null }) =>
    r.partner ? t('labels.couple', { first: person(r.user), second: person(r.partner) }) : person(r.user);

  /** "result summaries, values, questions" for a card. */
  const sharedList = (shared: Resource[], isCouple: boolean) =>
    list(
      resources
        .filter((r) => shared.includes(r))
        .map((r) => (r === 'result' && isCouple ? t('resources.results') : t(`resources.${r}`))),
    );

  /** The one-line reason on a queue card. Never message text. */
  const cardLine = (row: RequestRow) => {
    switch (row.source) {
      case 'flagged_result': {
        const first = row.flagReason
          ? t('card.flaggedWith', { reason: t(`flagReasons.${row.flagReason}`) })
          : t('card.flagged');
        return row.booking ? first : `${first} ${t('card.notBooked')}`;
      }
      case 'ai_escalation':
        return t('card.fromAssistant', { topic: t(`topics.${row.reason}`) });
      case 'booking': {
        const session = t(row.isCouple ? 'card.coupleSession' : 'card.individualSession');
        const shared = row.shared.length
          ? t('card.shared', { list: sharedList(row.shared, row.isCouple) })
          : t('card.nothingShared');
        return `${session} ${shared}`;
      }
      case 'patient_request':
        return t(row.reason === 'after_options' ? 'card.patientAsked.after_options' : 'card.patientAsked.other');
    }
  };

  /** "Carrier, sickle cell trait (HbAS)". */
  const resultLine = (r: SharedResult) => {
    // Hand-worded names in messages/{locale}/pro.json win, then the catalogue.
    const key = `conditions.${r.conditionCode}.${r.status === 'carrier' ? 'carrier' : 'name'}`;
    const fromCatalogue = r.conditionNames ? (r.status === 'carrier' ? r.conditionNames.carrier : r.conditionNames.name) : null;
    const condition = t.has?.(key) ? t(key) : (fromCatalogue ?? r.conditionCode.replace(/_/g, ' '));
    const line = t(`result.${r.status}`, { condition });
    return r.genotype ? t('result.genotype', { line, genotype: r.genotype }) : line;
  };

  /** Languages the people on a request chose, e.g. "Arabic or English". */
  const languages = (people: PersonDetail[]) => {
    const codes = [...new Set(people.map((p) => p.locale).filter((l): l is string => Boolean(l)))];
    return codes.map((c) => t(`detail.languages.${c}`)).join(t('labels.or'));
  };

  /** Who shared, for section labels: "(shared by Mariam)" / "(shared by both)". */
  const sharedBy = (detail: RequestDetail, owners: PersonDetail[]) => {
    if (!detail.isCouple || owners.length === 0) return null;
    if (owners.length === detail.people.length) return t('detail.sharedByBoth');
    return t('detail.sharedBy', { name: person(owners[0].label) });
  };

  /**
   * "family map, Ask GeneBridge summary (Khalid)": items missing for
   * everyone are listed plainly, others with the person's name.
   */
  const missingList = (detail: RequestDetail) =>
    list(
      resources.flatMap((res) => {
        const missingFor = detail.people.filter((p) => p.missing.includes(res));
        if (missingFor.length === 0) return [];
        const item = t(`resources.${res}`);
        if (missingFor.length === detail.people.length) return [item];
        return missingFor.map((p) => t('detail.missingFor', { item, name: person(p.label) }));
      }),
    );

  return { list, person, request, sharedList, cardLine, resultLine, languages, sharedBy, missingList };
}

/** "Dr. Amaka Okoro" → "AO" (titles ending in a dot are skipped). */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !w.endsWith('.'));
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked.map((w) => w[0]!.toUpperCase()).join('') || '·';
}

/** "Dr. Amaka Okoro" → "Dr. Amaka", as in the patient notification copy. */
export function shortName(name: string): string {
  return name.split(/\s+/).slice(0, 2).join(' ');
}
