/**
 * Family map (task 13): owner-only, enforced in the database.
 *   - only the owner reads and writes their family tables;
 *   - a partner (Khalid, through the couple link) sees nothing;
 *   - a counsellor sees the tree only through an unrevoked share_grants
 *     row on family_map, and loses it when it is revoked;
 *   - the 60-person limit and the graph rules hold in the database too.
 * Needs 20261108000000_family_tree.sql applied and `npm run seed:auth`.
 * Skipped without env vars or before the migration is applied.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, hasSupabase, signedInAs } from '../supabase';

const tablesReady = hasSupabase && !(await adminClient().from('family_members').select('id').limit(1)).error;
if (hasSupabase && !tablesReady) console.warn('RLS family map: apply supabase/migrations/20261108000000_family_tree.sql first.');

describe.skipIf(!tablesReady)('RLS: family map', () => {
  let mariam: SupabaseClient;
  let mariamId: string;
  let khalid: SupabaseClient;
  let khalidId: string;
  let amaka: SupabaseClient;
  let amakaId: string;
  let ownerNode: string;
  let uncle: string;

  const reset = async () => {
    await adminClient().from('share_grants').delete().eq('owner_id', mariamId).eq('resource', 'family_map');
    await adminClient().from('family_members').delete().eq('owner_id', mariamId);
  };

  beforeAll(async () => {
    ({ client: mariam, userId: mariamId } = await signedInAs('mariam'));
    ({ client: khalid, userId: khalidId } = await signedInAs('khalid'));
    ({ client: amaka, userId: amakaId } = await signedInAs('amaka'));
    await reset();
    const own = await mariam.from('family_members').insert({ owner_id: mariamId, relation_to_owner: 'self', is_owner: true }).select('id').single();
    expect(own.error).toBeNull();
    ownerNode = own.data!.id;
    const u = await mariam
      .from('family_members')
      .insert({ owner_id: mariamId, label: 'Saeed', relation_to_owner: 'uncle', side: 'paternal', sex: 'male', generation: -1, created_by: 'ai' })
      .select('id')
      .single();
    expect(u.error).toBeNull();
    uncle = u.data!.id;
    const c = await mariam.from('family_member_conditions').insert({ owner_id: mariamId, member_id: uncle, condition_id: 'beta_thalassemia', status: 'known', source: 'ai' });
    expect(c.error).toBeNull();
  }, 60_000);

  afterAll(reset);

  it('the owner reads their own tree', async () => {
    const { data } = await mariam.from('family_members').select('label').eq('owner_id', mariamId);
    expect((data ?? []).map((r) => r.label)).toContain('Saeed');
  });

  it('a partner sees nothing through the couple link', async () => {
    for (const table of ['family_members', 'family_links', 'family_member_conditions']) {
      const { data } = await khalid.from(table).select('id').eq('owner_id', mariamId);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it('nobody else can write to the tree', async () => {
    const insert = await khalid.from('family_members').insert({ owner_id: mariamId, relation_to_owner: 'brother', generation: 0 });
    expect(insert.error).not.toBeNull();
    await khalid.from('family_members').update({ label: 'changed' }).eq('id', uncle);
    await khalid.from('family_members').delete().eq('id', uncle);
    const { data } = await adminClient().from('family_members').select('label').eq('id', uncle).single();
    expect(data?.label).toBe('Saeed');
    // family_save runs as the caller: it can only touch the caller's own rows.
    await khalid.rpc('family_save', { p: { upsert: { members: [], links: [], conditions: [] }, remove: { members: [uncle], links: [], conditions: [] } } });
    expect((await adminClient().from('family_members').select('id').eq('id', uncle)).data).toHaveLength(1);
  });

  it('signed-out visitors see nothing', async () => {
    const { data } = await anonClient().from('family_members').select('id').eq('owner_id', mariamId);
    expect(data ?? []).toHaveLength(0);
  });

  it('a counsellor sees the tree only while a family_map grant is active', async () => {
    expect((await amaka.from('family_members').select('id').eq('owner_id', mariamId)).data ?? []).toHaveLength(0);
    const grant = await adminClient()
      .from('share_grants')
      .insert({ owner_id: mariamId, grantee_id: amakaId, resource: 'family_map', level: 'full' })
      .select('id')
      .single();
    expect(grant.error).toBeNull();
    expect((await amaka.from('family_members').select('id').eq('owner_id', mariamId)).data?.length).toBeGreaterThan(0);
    expect((await amaka.from('family_member_conditions').select('condition_id').eq('owner_id', mariamId)).data).toEqual([{ condition_id: 'beta_thalassemia' }]);
    // A grant to someone who is not a counsellor gives nothing.
    await adminClient().from('share_grants').insert({ owner_id: mariamId, grantee_id: khalidId, resource: 'family_map', level: 'full' });
    expect((await khalid.from('family_members').select('id').eq('owner_id', mariamId)).data ?? []).toHaveLength(0);

    await adminClient().from('share_grants').update({ revoked_at: new Date().toISOString() }).eq('id', grant.data!.id);
    expect((await amaka.from('family_members').select('id').eq('owner_id', mariamId)).data ?? []).toHaveLength(0);
  });

  it('keeps generations consistent and the owner node in place', async () => {
    const bad = await mariam.from('family_links').insert({ owner_id: mariamId, from_member: uncle, to_member: ownerNode, type: 'partner_of' });
    expect(bad.error).not.toBeNull();
    await mariam.from('family_members').delete().eq('id', ownerNode);
    expect((await adminClient().from('family_members').select('id').eq('id', ownerNode)).data).toHaveLength(1);
  });

  it('holds at most 60 people', async () => {
    const rows = Array.from({ length: 58 }, () => ({ owner_id: mariamId, relation_to_owner: 'relative', generation: 0 }));
    expect((await mariam.from('family_members').insert(rows)).error).toBeNull();
    const extra = await mariam.from('family_members').insert({ owner_id: mariamId, relation_to_owner: 'relative', generation: 0 });
    expect(extra.error?.message).toMatch(/family_map_full/);
  });
});
