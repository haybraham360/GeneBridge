/**
 * Seeds the counsellor workspace demo (task 07, section 7). Used by
 * `npm run seed:pro` and by the RLS and e2e tests, so every run starts from
 * the same queue. All data is synthetic.
 *
 * Needs the demo users (npm run seed:auth) and demo results
 * (npm run seed:results). It claims the demo results for their personas,
 * so run it after seed:results.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { DEMO_FACILITY_CODE, demoFacilities, demoUsers, type DemoUser } from '../../lib/auth/demoUsers';
import { demoResults } from '../../lib/onboarding/demoResults';
import { programmeDay } from '../../lib/pro/queue';

type Key = DemoUser['key'];

async function demoUserIds(admin: SupabaseClient): Promise<Record<Key, string>> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const ids = {} as Record<Key, string>;
  for (const persona of demoUsers) {
    const user = users.find((u) => u.email === persona.email);
    if (!user) throw new Error(`${persona.displayName} is not seeded. Run npm run seed:auth first.`);
    ids[persona.key] = user.id;
  }
  return ids;
}

function check<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

/** Today at hh:mm in Abu Dhabi (UTC+4, no daylight saving). */
const todayAt = (hhmm: string) => new Date(`${programmeDay(new Date())}T${hhmm}:00+04:00`).toISOString();

export type ProSeed = { ids: Record<Key, string>; requests: { r: string; l: string; couple: string; s: string } };

export async function seedPro(admin: SupabaseClient): Promise<ProSeed> {
  check(
    'facilities',
    await admin.from('facilities').upsert(
      demoFacilities.map((f) => ({ code: f.code, name: f.name })),
      { onConflict: 'code' },
    ),
  );
  const facility = check(
    'facility',
    await admin.from('facilities').select('id').eq('code', DEMO_FACILITY_CODE).single(),
  ) as { id: string };

  const ids = await demoUserIds(admin);
  const amaka = check('amaka', await admin.from('counsellors').select('id').eq('user_id', ids.amaka).single()) as {
    id: string;
  };
  const patients = [ids.mariam, ids.khalid, ids.patientR, ids.patientL, ids.patientS];

  // 1. Start clean for the demo patients (cascades remove bookings, notes and
  //    access requests). Real users are never touched.
  check('notifications', await admin.from('notifications').delete().in('user_id', patients));
  check('referrals', await admin.from('referrals').delete().in('user_id', patients));
  check('requests', await admin.from('counsellor_requests').delete().in('user_id', patients));
  check('share_grants', await admin.from('share_grants').delete().in('owner_id', patients));
  check('access_log', await admin.from('access_log').delete().in('resource_owner_id', patients));
  check('prep', await admin.from('counselling_prep').delete().in('user_id', patients));
  check('values', await admin.from('values_answers').delete().in('user_id', patients));
  check(
    'events',
    await admin
      .from('events')
      .delete()
      .in('user_id', patients)
      .in('name', ['teachback_answered', 'session_attended', 'referral_created']),
  );

  // 2. Each persona's result is connected to their account.
  for (const r of demoResults) {
    check(
      `claim ${r.reference_code}`,
      await admin
        .from('screening_results')
        .update({ owner_id: ids[r.persona], claimed_at: new Date().toISOString() })
        .eq('reference_code', r.reference_code),
    );
  }

  // 3. What patients prepared: questions in their own words, values, and
  //    Mariam's Ask GeneBridge summary (design: Pro.html).
  check(
    'prep',
    await admin.from('counselling_prep').insert([
      {
        user_id: ids.mariam,
        questions: [
          'Is the 25% chance the same in every pregnancy?',
          'What does IVF with embryo testing involve, and is it covered?',
        ],
        ai_summary:
          'Understands carrier status and the 25/50/25 chances. Asked about embryo testing and how to tell family. Felt “worried” at last check-in.',
      },
      { user_id: ids.khalid, questions: ['How should we talk to our parents about this?'] },
      {
        user_id: ids.patientS,
        questions: ['What are the options if we are both carriers?', 'Can my mother join the session?'],
      },
    ], { defaultToNull: false }),
  );
  check(
    'values',
    await admin.from('values_answers').insert([
      { user_id: ids.mariam, question_id: 'biological_children', value: 5 },
      { user_id: ids.mariam, question_id: 'religious_guidance', value: 4 },
      { user_id: ids.mariam, question_id: 'avoid_procedures', value: 5 },
      { user_id: ids.khalid, question_id: 'biological_children', value: 5 },
      { user_id: ids.khalid, question_id: 'religious_guidance', value: 4 },
      { user_id: ids.khalid, question_id: 'avoid_procedures', value: 2 },
    ]),
  );
  // Understanding check after the explainer: Mariam 3/3, Khalid 2/3.
  const teachback = (user: string, question: string, correct: boolean) => ({
    user_id: user,
    name: 'teachback_answered',
    props: { phase: 'post', question, correct },
  });
  check(
    'teachback',
    await admin
      .from('events')
      .insert([
        teachback(ids.mariam, 'q1', true),
        teachback(ids.mariam, 'q2', true),
        teachback(ids.mariam, 'q3', true),
        teachback(ids.khalid, 'q1', true),
        teachback(ids.khalid, 'q2', true),
        teachback(ids.khalid, 'q3', false),
      ]),
  );

  // 4. The four requests, all assigned to Dr. Amaka at the demo facility.
  const base = { facility_id: facility.id, assigned_counsellor_id: amaka.id };
  const rows = check(
    'requests',
    await admin
      .from('counsellor_requests')
      .insert([
        {
          ...base,
          user_id: ids.patientR,
          source: 'flagged_result',
          reason: 'flagged_result',
          urgency: 'priority',
          status: 'open',
          created_at: minutesAgo(120),
        },
        {
          ...base,
          user_id: ids.patientL,
          source: 'ai_escalation',
          reason: 'pregnancy',
          urgency: 'priority',
          status: 'open',
          share_summary: true,
          summary:
            'Currently pregnant and asking whether the baby could be affected. Her own screening result is not in the app yet. Prefers English.',
          created_at: minutesAgo(35),
        },
        {
          ...base,
          user_id: ids.mariam,
          partner_user_id: ids.khalid,
          source: 'booking',
          reason: 'couple_session',
          urgency: 'standard',
          status: 'booked',
          created_at: minutesAgo(9 * 24 * 60),
        },
        {
          ...base,
          user_id: ids.patientS,
          source: 'patient_request',
          reason: 'after_options',
          urgency: 'standard',
          status: 'open',
          created_at: minutesAgo(26 * 60),
        },
        // Columns left out of a row keep their defaults (not null).
      ], { defaultToNull: false })
      .select('id, user_id'),
  ) as { id: string; user_id: string }[];
  const requestFor = (user: string) => rows.find((r) => r.user_id === user)!.id;
  const requests = {
    r: requestFor(ids.patientR),
    l: requestFor(ids.patientL),
    couple: requestFor(ids.mariam),
    s: requestFor(ids.patientS),
  };

  check(
    'booking',
    await admin.from('bookings').insert({
      request_id: requests.couple,
      counsellor_id: amaka.id,
      starts_at: todayAt('10:00'),
      format: 'video',
      partner_invited: true,
    }),
  );

  // 5. What each person shared with Dr. Amaka. Patient R. shared nothing yet,
  //    and Patient L.'s summary came with her Ask GeneBridge request.
  const grant = (owner: string, resource: string, level = 'summary') => ({
    owner_id: owner,
    grantee_id: ids.amaka,
    resource,
    level,
    request_id: rows.find((r) => r.user_id === owner)?.id ?? requests.couple,
  });
  check(
    'grants',
    await admin
      .from('share_grants')
      .insert([
        grant(ids.mariam, 'result'),
        grant(ids.mariam, 'values_summary'),
        grant(ids.mariam, 'questions'),
        grant(ids.mariam, 'ai_summary'),
        grant(ids.khalid, 'result'),
        grant(ids.khalid, 'values_summary'),
        grant(ids.khalid, 'questions'),
        grant(ids.patientS, 'questions'),
      ]),
  );

  return { ids, requests };
}
