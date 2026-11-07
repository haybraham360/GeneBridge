/**
 * Privacy & consent on real data (task 15, section 1): who can see the
 * person's information now, and their consent history. Built from their own
 * share_grants (my_share_grants) and consents, never from demo values.
 */
export type ShareResource = 'result' | 'values_summary' | 'questions' | 'ai_summary' | 'family_map';
export type ShareLevel = 'summary' | 'full';

export type GrantRow = {
  id: string;
  grantee_id: string;
  grantee_name: string | null;
  grantee_role: 'professional' | 'partner';
  resource: ShareResource;
  level: ShareLevel;
  granted_at: string;
  revoked_at: string | null;
};

export type ConsentRow = {
  kind: 'terms' | 'couple_view' | 'compare_values';
  scope: string | null;
  granted_at: string;
  revoked_at: string | null;
};

export type Grantee = {
  granteeId: string;
  name: string | null;
  role: GrantRow['grantee_role'];
  resources: { resource: ShareResource; level: ShareLevel }[];
  /** When the earliest live grant began. */
  since: string;
};

/** Display order of shared items, result first. */
const RESOURCE_ORDER: ShareResource[] = ['result', 'values_summary', 'questions', 'ai_summary', 'family_map'];

/** Live grants, one entry per person, most recent first. */
export function liveGrantees(rows: GrantRow[]): Grantee[] {
  const byGrantee = new Map<string, Grantee>();
  for (const row of rows) {
    if (row.revoked_at) continue;
    const entry = byGrantee.get(row.grantee_id) ?? {
      granteeId: row.grantee_id,
      name: row.grantee_name?.trim() || null,
      role: row.grantee_role,
      resources: [],
      since: row.granted_at,
    };
    entry.resources.push({ resource: row.resource, level: row.level });
    if (row.granted_at < entry.since) entry.since = row.granted_at;
    byGrantee.set(row.grantee_id, entry);
  }
  for (const entry of byGrantee.values()) {
    entry.resources.sort((a, b) => RESOURCE_ORDER.indexOf(a.resource) - RESOURCE_ORDER.indexOf(b.resource));
  }
  return [...byGrantee.values()].sort((a, b) => b.since.localeCompare(a.since));
}

export type HistoryItem =
  | { kind: 'terms'; at: string }
  | { kind: 'couple_agreed'; at: string; level: string | null }
  | { kind: 'couple_withdrawn'; at: string }
  | { kind: 'compare_values'; at: string }
  | { kind: 'shared'; at: string; name: string | null; resource: ShareResource; level: ShareLevel }
  | { kind: 'stopped'; at: string; name: string | null; resource: ShareResource };

/** Changing the couple level revokes the old consent and adds a new one at once: not a withdrawal. */
const SAME_MOMENT_MS = 5_000;

/** Every consent and sharing change, most recent first. */
export function consentHistory(consents: ConsentRow[], grants: GrantRow[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  const coupleStarts = consents.filter((c) => c.kind === 'couple_view').map((c) => Date.parse(c.granted_at));

  for (const c of consents) {
    if (c.kind === 'terms') items.push({ kind: 'terms', at: c.granted_at });
    if (c.kind === 'compare_values') items.push({ kind: 'compare_values', at: c.granted_at });
    if (c.kind === 'couple_view') {
      items.push({ kind: 'couple_agreed', at: c.granted_at, level: c.scope });
      if (c.revoked_at) {
        const revoked = Date.parse(c.revoked_at);
        const replaced = coupleStarts.some((start) => Math.abs(start - revoked) < SAME_MOMENT_MS);
        if (!replaced) items.push({ kind: 'couple_withdrawn', at: c.revoked_at });
      }
    }
  }
  for (const g of grants) {
    const name = g.grantee_name?.trim() || null;
    items.push({ kind: 'shared', at: g.granted_at, name, resource: g.resource, level: g.level });
    if (g.revoked_at) items.push({ kind: 'stopped', at: g.revoked_at, name, resource: g.resource });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}
