/**
 * The app with zero data (task 15, section 1). After `npm run purge:demo`
 * GeneBridge must work for real people from an empty start: a brand-new
 * patient and a brand-new verified professional open every screen without
 * errors and see friendly empty states. Uses throwaway accounts, removed
 * after. Needs the task 15 migrations.
 */
import { expect, test, type Page } from '@playwright/test';
import { adminClient, createProfessional, deleteTestUser, hasSupabase } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

const run = Date.now();
const patientEmail = `empty-patient-${run}@example.test`;
const proEmail = `empty-pro-${run}@test.genebridge.invalid`;
let patientId: string;
let proId: string;

test.beforeAll(async () => {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: patientEmail,
    email_confirm: true,
    user_metadata: { display_name: 'Noor', locale: 'en' },
  });
  if (error) throw error;
  patientId = data.user.id;
  // Finished onboarding without a result or followed conditions: nothing at all.
  await admin.from('profiles').update({ display_name: 'Noor', locale: 'en', onboarding_step: 8 }).eq('user_id', patientId);
  await admin.from('consents').insert({ user_id: patientId, kind: 'terms' });
  proId = await createProfessional(proEmail, { status: 'verified', accepting: true, displayName: 'Dr. Empty Test' });
});

test.afterAll(async () => {
  if (patientId) await adminClient().auth.admin.deleteUser(patientId);
  if (proId) await deleteTestUser(proId);
});

async function signIn(page: Page, address: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: address });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
}

/** Opens a page and checks it rendered without a server error. */
async function opens(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBeLessThan(400);
  await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
  await expect(page.getByText(/Application error|Unhandled Runtime Error|Internal Server Error/)).toHaveCount(0);
}

test('a new patient with no data opens every screen without errors', async ({ page }) => {
  // Twelve screens, each compiled on first visit by the dev server.
  test.setTimeout(240_000);
  await signIn(page, patientEmail);
  for (const path of [
    '/en/dashboard',
    '/en/dashboard/results',
    '/en/dashboard/conditions',
    '/en/dashboard/couple',
    '/en/dashboard/simulator',
    '/en/dashboard/family',
    '/en/dashboard/talk',
    '/en/dashboard/options',
    '/en/dashboard/counsellor',
    '/en/dashboard/services',
    '/en/dashboard/scan',
    '/en/dashboard/privacy',
  ]) {
    await opens(page, path);
  }

  // Privacy shows their own (empty) sharing, never demo people.
  await opens(page, '/en/dashboard/privacy');
  await expect(page.getByTestId('who-can-see')).toContainText('You haven’t shared your information with anyone.');
  await expect(page.getByTestId('who-can-see')).not.toContainText('Amaka');
  await expect(page.getByText('No one has viewed your shared information yet.')).toBeVisible();
  await expect(page.getByTestId('consent-history')).toContainText('Agreed to the privacy terms');
});

test('a new verified professional with no patients sees empty states', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, proEmail);
  // The intake queue is shared, so it holds any open requests (including
  // demo ones until they're purged); it must still open cleanly.
  await opens(page, '/en/pro');
  for (const [path, empty] of [
    ['/en/pro/sessions', 'No sessions booked for today.'],
    ['/en/pro/patients', 'No patients yet.'],
    ['/en/pro/referrals', "You haven't created any referrals yet."],
    ['/en/pro/notes', 'No session notes yet.'],
  ] as const) {
    await opens(page, path);
    await expect(page.getByText(empty), path).toBeVisible();
  }
});
