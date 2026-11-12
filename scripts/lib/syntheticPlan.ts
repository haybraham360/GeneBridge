/**
 * Builds the synthetic analytics data set (task 05) in memory: people,
 * screening results, couple links and events. Pure and deterministic (fixed
 * seed), so the demo looks the same every time. scripts/seed-analytics.ts
 * creates the accounts and writes this plan to the database.
 *
 * Every number here is invented. Event names and props match what the app
 * logs (lib/auth/events.ts, lib/onboarding/events.ts, lib/analytics/events.ts),
 * so real usage lands in the same charts. Nothing about marriage status,
 * engagement cancellations or pregnancy decisions is generated.
 */

export type Language = 'ar' | 'en' | 'ur' | 'hi' | 'tl';
export type Mode = 'read' | 'listen' | 'read_listen';
export const CENTRES = ['[Centre A]', '[Centre B]', '[Centre C]'] as const;

export type PlannedPerson = {
  index: number;
  language: Language;
  mode: Mode | null;
  reason: 'premarital_result' | 'family_condition' | 'just_learning';
  signupAt: Date;
  onboardingStep: number;
  onboardingStartedAt: Date | null;
  onboardingCompletedAt: Date | null;
};

export type PlannedResult = {
  person: number;
  referenceCode: string;
  condition: 'sickle_cell' | 'beta_thalassemia';
  status: 'carrier' | 'affected' | 'no_variant' | 'uncertain';
  genotype: string | null;
  flagged: boolean;
  flagReason: 'vus' | null;
  centre: (typeof CENTRES)[number];
  reportedAt: Date;
  claimedAt: Date;
};

export type PlannedCouple = { inviter: number; invitee: number; acceptedAt: Date };

export type PlannedEvent = {
  person: number;
  name: string;
  props: Record<string, string | number | boolean>;
  at: Date;
};

export type Plan = {
  people: PlannedPerson[];
  results: PlannedResult[];
  couples: PlannedCouple[];
  events: PlannedEvent[];
};

const DAY = 86_400_000;
const MINUTE = 60_000;

/** Small seeded PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    between: (lo: number, hi: number) => lo + next() * (hi - lo),
    int: (lo: number, hi: number) => Math.floor(lo + next() * (hi - lo + 1)),
    normal: (mean: number, sd: number) => {
      const u = Math.max(next(), 1e-9);
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    pick<T>(weights: readonly (readonly [T, number])[]): T {
      const total = weights.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [value, w] of weights) {
        r -= w;
        if (r <= 0) return value;
      }
      return weights[weights.length - 1][0];
    },
  };
}

// Tagalog is kept small on purpose, so the "Hidden (under 10)" rule shows.
const LANGUAGES = [
  ['ar', 0.515],
  ['en', 0.33],
  ['ur', 0.097],
  ['hi', 0.042],
  ['tl', 0.016],
] as const;

const MODES = [
  ['read', 0.45],
  ['listen', 0.25],
  ['read_listen', 0.3],
] as const;

const CENTRE_WEIGHTS = [
  ['[Centre A]', 0.45],
  ['[Centre B]', 0.35],
  ['[Centre C]', 0.2],
] as const;

/** Teach-back gain (share correct, after minus before) by learning mode. */
const MODE_GAIN: Record<Mode, number> = { read: 0.3, listen: 0.34, read_listen: 0.38 };

/** Per-language differences, so the equity table has something to show. */
const LANGUAGE_PROFILE: Record<Language, { gain: number; book: number; attend: number; days: number }> = {
  ar: { gain: 0.02, book: 0.88, attend: 0.93, days: 0 },
  en: { gain: 0, book: 0.86, attend: 0.92, days: -1 },
  ur: { gain: -0.13, book: 0.78, attend: 0.88, days: 2 },
  hi: { gain: -0.02, book: 0.8, attend: 0.9, days: 1 },
  tl: { gain: -0.06, book: 0.78, attend: 0.88, days: 2 },
};

const clamp = (v: number, lo = 0.02, hi = 0.98) => Math.min(hi, Math.max(lo, v));

export function buildPlan({
  users = 1250,
  days = 90,
  now = new Date(),
  seed = 20261104,
}: { users?: number; days?: number; now?: Date; seed?: number } = {}): Plan {
  const r = rng(seed);
  const nowMs = now.getTime();
  const events: PlannedEvent[] = [];
  const at = (ms: number) => new Date(ms);
  const add = (person: number, name: string, ms: number, props: PlannedEvent['props'] = {}) => {
    // Recent sign-ups haven't got that far yet: future events are dropped.
    if (ms < nowMs) events.push({ person, name, props, at: at(ms) });
  };

  // ---- People and onboarding ---------------------------------------------
  const people: PlannedPerson[] = [];
  for (let i = 0; i < users; i++) {
    const language = r.pick(LANGUAGES);
    // Sign-ups grow a little over the window.
    const signupMs = nowMs - days * DAY * (1 - Math.pow(r.next(), 0.8) * 0.999) - r.between(0, 3) * 3_600_000;
    const started = r.chance(0.98);
    const completed = started && r.chance(0.9);
    const mode = started && r.chance(0.95) ? r.pick(MODES) : null;
    const seconds = r.int(70, 260);
    const lastStep = completed ? 8 : started ? r.int(1, 7) : 0;

    for (let step = 1; step <= Math.min(lastStep, 8); step++) {
      add(i, 'onboarding_step_completed', signupMs + step * 15_000, {
        step,
        skipped: step !== 5 && r.chance(0.12),
      });
    }
    if (mode) add(i, 'onboarding_learning_mode_set', signupMs + 30_000, { mode });
    if (completed) add(i, 'onboarding_completed', signupMs + seconds * 1000, { seconds });
    add(i, 'sign_up_completed', signupMs);

    people.push({
      index: i,
      language,
      mode,
      reason: r.pick([
        ['premarital_result', 0.7],
        ['family_condition', 0.18],
        ['just_learning', 0.12],
      ] as const),
      signupAt: at(signupMs),
      onboardingStep: lastStep,
      onboardingStartedAt: started ? at(signupMs) : null,
      onboardingCompletedAt: completed && signupMs + seconds * 1000 < nowMs ? at(signupMs + seconds * 1000) : null,
    });
  }

  // ---- Screening results ---------------------------------------------------
  // Most people who finish onboarding connect a result; the rest appear under
  // "All centres" only.
  const results = new Map<number, PlannedResult>();
  const claimMs = new Map<number, number>();
  for (const p of people) {
    if (p.onboardingStep < 6 || !r.chance(0.96)) continue;
    const claimed = p.signupAt.getTime() + 2 * MINUTE;
    if (claimed >= nowMs) continue;
    claimMs.set(p.index, claimed);
    results.set(p.index, {
      person: p.index,
      referenceCode: `SYN-${String(p.index + 1).padStart(5, '0')}`,
      condition: r.chance(0.7) ? 'sickle_cell' : 'beta_thalassemia',
      status: 'no_variant',
      genotype: null,
      flagged: false,
      flagReason: null,
      centre: r.pick(CENTRE_WEIGHTS),
      reportedAt: at(p.signupAt.getTime() - r.int(2, 20) * DAY),
      claimedAt: at(claimed),
    });
    add(p.index, 'result_claimed', claimed);
  }

  // ---- Couples ------------------------------------------------------------
  // Pair people with results, mostly within the same language. About a
  // quarter of them end up in an at-risk couple (both carry a changed copy
  // of the same condition); some others are linked couples without shared
  // risk.
  const withResults = [...results.keys()];
  const byLanguage = new Map<Language, number[]>();
  for (const idx of withResults) {
    const lang = people[idx].language;
    byLanguage.set(lang, [...(byLanguage.get(lang) ?? []), idx]);
  }
  const couples: PlannedCouple[] = [];
  const atRisk: [number, number][] = [];
  for (const group of byLanguage.values()) {
    // Deterministic shuffle.
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    for (let i = 0; i + 1 < group.length; i += 2) {
      const [a, b] = [group[i], group[i + 1]];
      const roll = r.next();
      if (roll > 0.42) continue; // not linked to a partner
      const accepted = Math.max(claimMs.get(a)!, claimMs.get(b)!) + r.between(0.2, 3) * DAY;
      if (accepted >= nowMs) continue;
      couples.push({ inviter: a, invitee: b, acceptedAt: at(accepted) });
      add(a, 'partner_invite_created', accepted - DAY / 2, { channel: r.chance(0.7) ? 'whatsapp' : 'copy' });
      add(b, 'partner_invite_accepted', accepted);
      const ra = results.get(a)!;
      const rb = results.get(b)!;
      if (roll < 0.29) {
        rb.condition = ra.condition;
        ra.status = 'carrier';
        rb.status = r.chance(0.04) ? 'affected' : 'carrier';
        atRisk.push([a, b]);
      } else {
        ra.status = r.chance(0.5) ? 'carrier' : 'no_variant';
      }
    }
  }
  // A few uncertain (flagged) and single-carrier results among everyone else.
  for (const res of results.values()) {
    if (res.status !== 'no_variant') continue;
    if (r.chance(0.02)) {
      res.status = 'uncertain';
      res.flagged = true;
      res.flagReason = 'vus';
    } else if (r.chance(0.1)) {
      res.status = 'carrier';
    }
  }
  for (const res of results.values()) {
    res.genotype =
      res.condition === 'sickle_cell'
        ? { carrier: 'HbAS', affected: 'HbSS', no_variant: 'HbAA', uncertain: null }[res.status]
        : { carrier: 'β/βthal', affected: 'βthal/βthal', no_variant: 'β/β', uncertain: null }[res.status];
  }

  // ---- Viewing results and teach-back ----------------------------------------
  const viewMs = new Map<number, number>();
  for (const [idx, res] of results) {
    if (!r.chance(0.95)) continue;
    const viewed = res.claimedAt.getTime() + r.between(0.01, 1.5) * DAY;
    add(idx, 'result_viewed', viewed);
    if (viewed < nowMs) viewMs.set(idx, viewed);

    // Flagged results skip the explainer, so there is no teach-back.
    if (res.flagged || !r.chance(0.9)) continue;
    const p = people[idx];
    const pre = clamp(r.normal(0.52, 0.14));
    const gain = MODE_GAIN[p.mode ?? 'read'] + LANGUAGE_PROFILE[p.language].gain;
    const post = clamp(pre + r.normal(gain, 0.09), 0.05, 0.99);
    const questions = ['q1', 'q2', 'q3'] as const;
    questions.forEach((question, q) =>
      add(idx, 'teachback_answered', viewed + (q + 1) * 20_000, {
        phase: 'pre',
        question,
        correct: r.chance(pre),
      }),
    );
    if (r.chance(0.94)) {
      questions.forEach((question, q) =>
        add(idx, 'teachback_answered', viewed + 8 * MINUTE + (q + 1) * 20_000, {
          phase: 'post',
          question,
          correct: r.chance(post),
        }),
      );
    }
  }

  // ---- Counselling ----------------------------------------------------------
  const counselling = (people_: number[], language: Language) => {
    const viewed = people_.map((p) => viewMs.get(p)).filter((v): v is number => v !== undefined);
    if (viewed.length === 0) return;
    const profile = LANGUAGE_PROFILE[language];
    if (!r.chance(profile.book)) return;
    const booked = Math.max(...viewed) + r.between(0.5, 3 + profile.days / 2) * DAY;
    add(people_[0], 'booking_created', booked);
    if (!r.chance(profile.attend)) return;
    const attended = booked + r.between(1.5, 4.5 + profile.days / 2) * DAY;
    for (const p of people_) add(p, 'session_attended', attended);
  };
  for (const [a, b] of atRisk) counselling([a, b], people[a].language);
  // Some people book on their own (for example a flagged result or a
  // single carrier with questions).
  const inCouple = new Set(atRisk.flat());
  for (const [idx, res] of results) {
    if (inCouple.has(idx) || !viewMs.has(idx)) continue;
    if (r.chance(res.flagged ? 0.9 : res.status === 'carrier' ? 0.2 : 0.03)) {
      counselling([idx], people[idx].language);
    }
  }

  addLaterFeatureEvents({ seed, people, results, viewMs, add });

  return { people, results: [...results.values()], couples, events };
}

/**
 * Events for features added after task 05: exploring path (task 11), report
 * scanner (task 12) and "Care near you". Uses its own random stream, so the
 * people, results and figures above stay exactly as they were.
 */
function addLaterFeatureEvents({
  seed,
  people,
  results,
  viewMs,
  add,
}: {
  seed: number;
  people: PlannedPerson[];
  results: Map<number, PlannedResult>;
  viewMs: Map<number, number>;
  add: (person: number, name: string, ms: number, props?: PlannedEvent['props']) => void;
}) {
  const r = rng(seed + 1);

  // Path chosen at the end of onboarding: a result connected, or exploring.
  // About a third of explorers later add a result.
  for (const p of people) {
    if (!p.onboardingCompletedAt) continue;
    const done = p.onboardingCompletedAt.getTime();
    if (results.has(p.index)) {
      add(p.index, 'user_path_set', done, { path: 'result' });
      continue;
    }
    add(p.index, 'user_path_set', done, { path: 'exploring' });
    if (r.chance(p.reason === 'family_condition' ? 0.42 : 0.3)) {
      const later = done + r.between(2, 40) * DAY;
      add(p.index, 'exploring_result_added', later);
      add(p.index, 'user_path_set', later, { path: 'result' });
    }
  }

  // Report scanner: some people photograph their report after viewing the result.
  for (const [idx, res] of results) {
    const viewed = viewMs.get(idx);
    if (viewed === undefined || !r.chance(0.28)) continue;
    add(idx, 'scan_completed', viewed + r.between(0.05, 6) * DAY, {
      seconds: Math.round(clamp(r.normal(24, 7), 9, 60)),
      findings: r.int(1, 3),
      flagged: res.flagged ? 1 : 0,
      report_type: 'carrier_screening',
    });
  }

  // Care near you: distance to the nearest verified professional, as a band only.
  for (const [idx] of results) {
    const viewed = viewMs.get(idx);
    if (viewed === undefined || !r.chance(0.34)) continue;
    const ms = viewed + r.between(0.1, 10) * DAY;
    if (r.chance(0.06)) {
      add(idx, 'nearby_location_method', ms, { method: 'denied' });
      continue;
    }
    add(idx, 'nearby_location_method', ms, {
      method: r.pick([
        ['device', 0.55],
        ['area', 0.3],
        ['place', 0.15],
      ] as const),
      radius_km: 25,
      nearest_band: r.pick([
        ['lt5', 0.37],
        ['5to10', 0.27],
        ['10to25', 0.2],
        ['25plus', 0.1],
        ['none', 0.06],
      ] as const),
    });
  }
}
