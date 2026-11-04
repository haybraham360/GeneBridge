/**
 * Onboarding (task 04). Needs Supabase env vars, both migrations, and
 * `npm run seed:auth` + `npm run seed:results`. See README.md.
 *
 * Each test puts the persona back at the start of onboarding, and the
 * personas are marked finished again afterwards so the auth tests still
 * land on /dashboard.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  adminClient,
  findUserId,
  hasSupabase,
  persona,
  resetOnboarding,
  restoreFinished,
} from '../supabase';
import type { DemoUser } from '../../lib/auth/demoUsers';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

const MARIAM_CODE = 'AD-PMS-2026-048213';
const PATIENT_R_CODE = 'AD-PMS-2026-048215';

test.afterAll(async () => {
  for (const key of ['mariam', 'khalid', 'patientR'] as const) await restoreFinished(key);
});

/** Signs in through the app's own callback with a freshly minted magic link. */
async function signIn(page: Page, key: DemoUser['key']) {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: persona(key).email,
  });
  if (error) throw error;
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  await page.goto(`/en/auth/callback?${params}`);
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const stepLabel = (page: Page, n: number) => page.getByText(`Step ${n} of 8`, { exact: true });

async function expectStep(page: Page, n: number, title: string) {
  await expect(stepLabel(page, n)).toBeVisible();
  await expect(heading(page)).toHaveText(title);
}

/** Skips from step 2 to the privacy step and agrees. Ends on step 6. */
async function quickToConnect(page: Page) {
  await page.getByRole('button', { name: "Let's start" }).click();
  for (const n of [2, 3, 4]) {
    await expect(stepLabel(page, n)).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();
  }
  await expectStep(page, 5, 'Your privacy, in three points');
  await page.getByRole('checkbox', { name: 'I understand and agree' }).check();
  await page.getByRole('button', { name: 'I agree' }).click();
  await expectStep(page, 6, 'Connect your screening result (optional)');
}

test('Mariam completes onboarding, claims her result and ends on /dashboard/results', async ({ page }) => {
  const userId = await resetOnboarding('mariam');
  const started = Date.now();
  await signIn(page, 'mariam');
  await expect(page).toHaveURL(/\/en\/onboarding$/);

  // 1. Welcome
  await expectStep(page, 1, 'Welcome to GeneBridge');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: "Let's start" }).click();

  // 2. Language: focus moves to the new heading.
  await expectStep(page, 2, 'Which language do you prefer?');
  await expect(heading(page)).toBeFocused();
  await expect(page.getByRole('radio', { name: /English/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // 3. Learning style: Next waits for a choice; arrow keys move the choice.
  await expectStep(page, 3, 'How do you like to learn?');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: /^Read Text on screen/ }).click();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /^Listen/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('radio', { name: /^Read Text on screen/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // 4. Reason
  await expectStep(page, 4, 'What brings you here?');
  await page.getByRole('radio', { name: /My premarital screening result/ }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // 5. Privacy: no Skip, and the box must be ticked.
  await expectStep(page, 5, 'Your privacy, in three points');
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await page.getByRole('button', { name: 'I agree' }).click();
  await expect(page.getByText('Please tick the box to continue.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'I understand and agree' }).check();
  await page.getByRole('button', { name: 'I agree' }).click();

  // 6. Connect: a wrong code gets the neutral message, then the real one.
  await expectStep(page, 6, 'Connect your screening result (optional)');
  const field = page.getByLabel('Screening reference number');
  await field.fill('AD-PMS-2026-000001');
  await page.getByRole('button', { name: 'Connect result' }).click();
  await expect(
    page.getByText(
      "We couldn't find that reference. Check the number on your report, or ask your screening centre.",
    ),
  ).toBeVisible();
  await field.fill(MARIAM_CODE.toLowerCase());
  await field.press('Enter');
  await expect(page.getByText('Result connected.')).toBeVisible();
  // No result details on this step.
  await expect(page.getByText(/sickle|carrier|HbAS/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // 7. Invite: says plainly that nothing is shared.
  await expectStep(page, 7, 'Invite your partner (optional)');
  await expect(page.getByText('Inviting your partner does not share your result.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 8. Done
  await expectStep(page, 8, "You're all set");
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await expect(page.getByText('Language: English')).toBeVisible();
  await expect(page.getByText('Learning style: Read')).toBeVisible();
  await expect(page.getByText('Result connected', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'See what my result means' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard\/results$/);
  const seconds = (Date.now() - started) / 1000;
  console.log(`Mariam onboarding run (automated): ${seconds.toFixed(1)}s`);

  // Saved as she went.
  const admin = adminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('onboarding_step, learning_mode, reason, locale')
    .eq('user_id', userId)
    .single();
  expect(profile).toEqual({
    onboarding_step: 8,
    learning_mode: 'read',
    reason: 'premarital_result',
    locale: 'en',
  });
  const { data: consent } = await admin
    .from('consents')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', 'privacy_basics');
  expect(consent).toHaveLength(1);
  const { data: result } = await admin
    .from('screening_results')
    .select('owner_id')
    .eq('reference_code', MARIAM_CODE)
    .single();
  expect(result?.owner_id).toBe(userId);

  // Events: the expected names, and never the reference code.
  const { data: events } = await admin
    .from('events')
    .select('name, props')
    .eq('user_id', userId)
    .gte('created_at', new Date(started - 5000).toISOString());
  const names = new Set(events?.map((e) => e.name));
  for (const name of [
    'onboarding_step_completed',
    'onboarding_learning_mode_set',
    'result_claimed',
    'onboarding_completed',
  ]) {
    expect(names).toContain(name);
  }
  expect(JSON.stringify(events)).not.toContain('048213');

  // Finished: signing in again goes straight home.
  await page.goto('/en/onboarding');
  await expect(page).toHaveURL(/\/en\/dashboard$/);
});

test('Patient R. (flagged) ends on the counsellor route with no risk shown', async ({ page }) => {
  await resetOnboarding('patientR');
  await signIn(page, 'patientR');
  await quickToConnect(page);

  await page.getByLabel('Screening reference number').fill(PATIENT_R_CODE);
  await page.getByRole('button', { name: 'Connect result' }).click();
  await expect(page.getByText('Result connected.')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Skip' }).click();

  await expectStep(page, 8, "You're all set");
  const card = page.locator('main');
  await expect(card).not.toContainText(/risk|%|carrier|uncertain|variant|chance/i);
  await expect(page.getByRole('link', { name: 'See what my result means' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Talk to a counsellor about your result' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard\/counsellor$/);
});

test('leaving at step 4 and signing in again resumes at step 4', async ({ page, context }) => {
  await resetOnboarding('khalid');
  await signIn(page, 'khalid');
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('radio', { name: /^Listen/ }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 4, 'What brings you here?');

  // Escape doesn't lose anything.
  await page.keyboard.press('Escape');
  await expectStep(page, 4, 'What brings you here?');

  // Leave: sign out completely, then come back.
  await context.clearCookies();
  await page.goto('/en/onboarding');
  await expect(page).toHaveURL(/\/en\/auth\?next=%2Fonboarding$/);
  await signIn(page, 'khalid');
  await expectStep(page, 4, 'What brings you here?');

  // Back saves too, and the learning style is remembered.
  await page.getByRole('button', { name: 'Back' }).click();
  await expectStep(page, 3, 'How do you like to learn?');
  await expect(page.getByRole('radio', { name: /^Listen/ })).toHaveAttribute('aria-checked', 'true');
});

test('choosing Arabic switches the language and direction straight away', async ({ page }) => {
  await resetOnboarding('khalid');
  await signIn(page, 'khalid');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: "Let's start" }).click();
  await expectStep(page, 2, 'Which language do you prefer?');

  await page.getByRole('radio', { name: /العربية/ }).click();
  await expect(page).toHaveURL(/\/ar\/onboarding$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(heading(page)).toHaveText('ما اللغة التي تفضّلها؟');
  await expect(page.getByRole('radio', { name: /العربية/ })).toHaveAttribute('aria-checked', 'true');

  // Urdu falls back to English text, left to right, with a note.
  await page.getByRole('radio', { name: /اردو/ }).click();
  await expect(page).toHaveURL(/\/en\/onboarding$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByText(/Full translation coming soon/)).toBeVisible();

  const userId = await findUserId({ email: persona('khalid').email });
  const { data } = await adminClient()
    .from('profiles')
    .select('locale')
    .eq('user_id', userId!)
    .single();
  expect(data?.locale).toBe('ur');
});

test('the screening result is optional: Next moves on without one', async ({ page }) => {
  const userId = await resetOnboarding('khalid');
  await signIn(page, 'khalid');
  await quickToConnect(page);
  await expect(page.getByRole('button', { name: 'Connect result' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 7, 'Invite your partner (optional)');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectStep(page, 8, "You're all set");
  await expect(page.getByText('Result connected', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Go to my home' })).toBeVisible();

  const { data } = await adminClient()
    .from('screening_results')
    .select('id')
    .eq('owner_id', userId);
  expect(data).toHaveLength(0);
});

test('Skip is not offered on the privacy step', async ({ page }) => {
  await resetOnboarding('khalid');
  await signIn(page, 'khalid');
  await page.getByRole('button', { name: "Let's start" }).click();
  for (const n of [2, 3, 4]) {
    await expect(stepLabel(page, n)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();
  }
  await expectStep(page, 5, 'Your privacy, in three points');
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
});

test('the invite link connects Mariam and Khalid as active', async ({ browser }) => {
  // Two people, two onboardings and a sign-in: more than the default 30s in dev.
  test.setTimeout(90_000);
  const mariamId = await resetOnboarding('mariam');
  const khalidId = await resetOnboarding('khalid');

  // Mariam creates the invite with "Copy invite link".
  const mariamContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const mariam = await mariamContext.newPage();
  await signIn(mariam, 'mariam');
  await quickToConnect(mariam);
  await mariam.getByRole('button', { name: 'Skip' }).click();
  await expectStep(mariam, 7, 'Invite your partner (optional)');
  await mariam.getByRole('button', { name: 'Copy invite link' }).click();
  await expect(mariam.getByText('Link copied')).toBeVisible();
  const link = await mariam.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/en\/invite\/[a-f0-9]{64}$/);

  const { data: pending } = await adminClient()
    .from('couple_links')
    .select('status, invitee_id')
    .eq('inviter_id', mariamId);
  expect(pending).toEqual([{ status: 'pending', invitee_id: null }]);

  // Khalid opens it signed out, signs in, and accepts.
  const khalidContext = await browser.newContext();
  const khalid = await khalidContext.newPage();
  const path = new URL(link).pathname;
  await khalid.goto(path);
  await expect(khalid).toHaveURL(
    new RegExp(`/en/auth\\?next=${encodeURIComponent(path.replace(/^\/en/, ''))}$`),
  );
  await khalid.getByRole('tab', { name: 'Sign in' }).click();
  await khalid.getByRole('button', { name: 'Continue with UAE PASS' }).click();
  await khalid.getByRole('dialog').getByRole('button', { name: /Khalid/ }).click();
  // Generous timeout: in dev, the first visit compiles the invite page.
  await expect(khalid).toHaveURL(new RegExp(`${path}$`), { timeout: 20_000 });
  await expect(khalid.getByText('Accepting does not share any result, for either of you.')).toBeVisible();
  await khalid.getByRole('button', { name: 'Accept invite' }).click();
  await expect(khalid).toHaveURL(/\/en\/onboarding$/, { timeout: 15_000 });

  const { data: active } = await adminClient()
    .from('couple_links')
    .select('status, inviter_id, invitee_id')
    .eq('inviter_id', mariamId);
  expect(active).toEqual([{ status: 'active', inviter_id: mariamId, invitee_id: khalidId }]);

  // Khalid's own onboarding skips the invite step.
  await quickToConnect(khalid);
  await khalid.getByRole('button', { name: 'Skip' }).click();
  await expectStep(khalid, 8, "You're all set");

  // The same link can't be used again.
  await khalid.goto(path);
  await khalid.getByRole('button', { name: 'Accept invite' }).click();
  await expect(khalid.getByText(/expired or has already been used/)).toBeVisible();

  await mariamContext.close();
  await khalidContext.close();
});
