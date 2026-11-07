/**
 * Professional sign-up and verification (task 14, section 10). Needs Supabase
 * env vars, all migrations (including 20261109000000_professional_kyc.sql),
 * `npm run seed:auth` and `npm run samples:kyc`. Set KYC_TEST_PRECHECK=1 in
 * .env.local so the AI pre-check isn't called (the tests don't depend on its
 * result either way). All accounts and documents are synthetic.
 */
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  adminClient,
  createProfessional,
  deleteTestUser,
  ensureKycAdmin,
  findUserId,
  hasSupabase,
  KYC_ADMIN_EMAIL,
  signedInAs,
} from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

const SAMPLES = join('samples', 'kyc');
const created: string[] = [];

test.afterAll(async () => {
  for (const id of created) await deleteTestUser(id).catch(() => undefined);
});

async function openMagicLink(page: Page, email: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
}

async function signIn(page: Page, email: string) {
  await openMagicLink(page, email);
  await expect(page).not.toHaveURL(/\/auth/);
}

async function directoryIds(): Promise<string[]> {
  const { client } = await signedInAs('mariam');
  const { data } = await client.rpc('professional_directory');
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
}

test('sign up as a health professional → 4-step onboarding → /pro with the verify banner and locked pages', async ({ page }) => {
  const email = 'kyc-signup@demo.genebridge.app';
  const existing = await findUserId({ email });
  if (existing) await deleteTestUser(existing);

  await page.goto('/en/auth');
  await page.getByRole('radio', { name: /I'm a health professional/ }).click();
  await page.getByRole('checkbox').check();
  await page.route('**/auth/v1/otp**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  if (process.env.PHONE_AUTH_ENABLED === 'true') await page.getByRole('button', { name: /Use email instead/ }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  // The real send would create the account; do the same.
  const { data: user } = await adminClient().auth.admin.createUser({ email, email_confirm: true, user_metadata: { locale: 'en' } });
  created.push(user.user!.id);
  await openMagicLink(page, email);

  await expect(page).toHaveURL(/\/en\/auth\/password\?next=%2Fonboarding$/);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/en\/onboarding$/);

  // 1. Welcome
  await expect(page.getByRole('heading', { name: 'Welcome to GeneBridge for professionals' })).toBeVisible();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  // 2. About you
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Enter your full name as it appears on your licence.')).toBeVisible();
  await page.getByLabel('Full name as on your licence').fill('Dr. Sample Professional');
  await page.getByLabel('Profession').selectOption('genetic_counsellor');
  await page.getByText('Carrier and premarital screening').click();
  await page.getByLabel('Years of experience').fill('8');
  await page.getByRole('button', { name: 'Next' }).click();
  // 3. Language and notifications
  await expect(page.getByRole('heading', { name: 'Language and notifications' })).toBeVisible();
  await page.getByRole('radio', { name: /English/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  // 4. Done
  await expect(page.getByRole('heading', { name: "You're in" })).toBeVisible();
  await page.getByRole('link', { name: 'Go to my dashboard' }).click();

  await expect(page).toHaveURL(/\/en\/pro$/);
  await expect(page.getByTestId('verify-banner')).toContainText('Complete verification to start seeing patients');
  await expect(page.getByTestId('locked-state')).toContainText("Available once you're verified");
  for (const name of ['Patients', 'Referrals', "Today's sessions"]) {
    await page.getByRole('navigation').getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByTestId('locked-state')).toBeVisible();
  }
  // Their own pages work.
  await page.getByRole('navigation').getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByLabel('Full name as on your licence')).toHaveValue('Dr. Sample Professional');

  const id = user.user!.id;
  const admin = adminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('user_id', id).single();
  expect(profile?.role).toBe('professional');
  const { data: pro } = await admin.from('professional_profiles').select('verification_status, accepting_patients, profession').eq('user_id', id).single();
  expect(pro).toEqual({ verification_status: 'unverified', accepting_patients: false, profession: 'genetic_counsellor' });
  const { data: events } = await admin.from('events').select('name, props').eq('user_id', id).eq('name', 'pro_signup_completed');
  expect(events?.[0]?.props).toEqual({ profession: 'genetic_counsellor' });
  expect(await directoryIds()).not.toContain(id);
});

test('verification → pending → admin approves (documents deleted) → pages unlock → suspend hides them', async ({ page, browser }) => {
  const email = 'kyc-flow@demo.genebridge.app';
  const id = await createProfessional(email, { displayName: 'Dr. Sample Professional' });
  created.push(id);
  await signIn(page, email);

  await page.goto('/en/pro/verify');
  await page.getByLabel('Licence number').fill('SAMPLE-LIC-12345');
  await page.getByLabel('Issuing authority').selectOption('dha');
  await page.getByLabel('Expiry date').fill('2030-12-31');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Photograph your professional licence' })).toBeVisible();
  await page.getByLabel('Upload a file').setInputFiles(join(SAMPLES, 'licence-sample.jpg'));
  await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Photograph your government ID' })).toBeVisible();
  await page.getByLabel('Upload a file').setInputFiles(join(SAMPLES, 'id-front-sample.jpg'));
  await page.getByLabel('Upload a file').setInputFiles(join(SAMPLES, 'id-back-sample.jpg'));
  await expect(page.getByText('Back', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Upload a file').setInputFiles(join(SAMPLES, 'selfie-sample.jpg'));
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Review and submit' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Please confirm to continue.')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page).toHaveURL(/\/en\/pro\/verify\/submission\?sent=1$/, { timeout: 60_000 });
  await expect(page.getByTestId('submission-status')).toHaveText('Waiting for review');

  await page.goto('/en/pro');
  await expect(page.getByTestId('verify-banner')).toHaveAttribute('data-state', 'pending');
  await expect(page.getByTestId('locked-state')).toBeVisible();

  // Stored encrypted, in the professional's own folder.
  const service = adminClient();
  const { data: sub } = await service
    .from('verification_submissions')
    .select('id, id_document_paths, licence_document_paths, selfie_path, status')
    .eq('user_id', id)
    .single();
  expect(sub?.status).toBe('submitted');
  expect(sub?.id_document_paths).toHaveLength(2);
  const { data: blob } = await service.storage.from('kyc-documents').download(sub!.licence_document_paths[0]);
  expect(Buffer.from(await blob!.arrayBuffer()).subarray(0, 4).toString()).toBe('GBK1');
  const draftFolder = sub!.licence_document_paths[0].split('/').slice(0, 2).join('/');

  // The admin reviews and approves.
  await ensureKycAdmin();
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, KYC_ADMIN_EMAIL);
  await adminPage.goto('/en/admin/verifications');
  await adminPage.getByTestId('queue-row').filter({ hasText: 'Dr. Sample Professional' }).first().click();
  await expect(adminPage.getByTestId('review-status')).toHaveText('In review');
  await expect(adminPage.getByRole('heading', { name: 'Professional licence' })).toBeVisible();
  await expect(adminPage.getByTestId('registry-note')).toContainText('[CONFIRM SOURCE]');
  await adminPage.getByRole('button', { name: 'Approve and verify' }).click();
  await expect(adminPage.getByText('Done. The documents were deleted.')).toBeVisible();

  // Privacy: nothing left in storage, paths cleared, the trail kept.
  const { data: left } = await service.storage.from('kyc-documents').list(draftFolder);
  expect(left ?? []).toHaveLength(0);
  const { data: after } = await service
    .from('verification_submissions')
    .select('status, id_document_paths, licence_document_paths, selfie_path')
    .eq('id', sub!.id)
    .single();
  expect(after).toEqual({ status: 'approved', id_document_paths: [], licence_document_paths: [], selfie_path: null });
  const { data: audit } = await service.from('verification_audit').select('action').eq('submission_id', sub!.id);
  expect(audit?.map((a) => a.action)).toEqual(expect.arrayContaining(['submitted', 'viewed', 'document_viewed', 'approved', 'documents_deleted']));
  const { data: pro } = await service.from('professional_profiles').select('verification_status, licence_number, licence_authority, licence_expiry').eq('user_id', id).single();
  expect(pro).toEqual({ verification_status: 'verified', licence_number: 'SAMPLE-LIC-12345', licence_authority: 'dha', licence_expiry: '2030-12-31' });

  // Pages unlock, with a one-time welcome card.
  await page.goto('/en/pro');
  await expect(page.getByTestId('welcome-card')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your queue' })).toBeVisible();
  await expect(page.getByTestId('locked-state')).toHaveCount(0);
  await expect(page.getByTestId('verify-banner')).toHaveCount(0);

  // Off by default; turning it on puts them in the directory.
  expect(await directoryIds()).not.toContain(id);
  const toggle = page.getByRole('switch', { name: 'Accepting new patients' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect.poll(directoryIds).toContain(id);

  // The admin suspends them: they disappear from the directory at once.
  await adminPage.goto('/en/admin/verifications?tab=professionals');
  const row = adminPage.getByTestId('professional-row').filter({ hasText: 'Dr. Sample Professional' }).first();
  await row.getByRole('button', { name: 'Suspend' }).click();
  await row.getByLabel(/Reason for suspending/).fill('Test suspension');
  await row.getByRole('button', { name: 'Suspend now' }).click();
  await expect.poll(directoryIds).not.toContain(id);
  await adminContext.close();

  await page.goto('/en/pro');
  await expect(page.getByTestId('verify-banner')).toHaveAttribute('data-state', 'suspended');
  await expect(page.getByTestId('locked-state')).toBeVisible();
});

test('an expired licence locks access again', async ({ page }) => {
  const email = 'kyc-expired@demo.genebridge.app';
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const id = await createProfessional(email, { status: 'verified', accepting: true, licenceExpiry: yesterday });
  created.push(id);

  // Access ends on the expiry day, before the daily job runs.
  expect(await directoryIds()).not.toContain(id);
  await signIn(page, email);
  await page.goto('/en/pro/patients');
  await expect(page.getByTestId('locked-state')).toBeVisible();

  // The daily job marks it expired, turns accepting off and asks for the renewal.
  const { data: expired } = await adminClient().rpc('kyc_expire_licences');
  expect(expired as string[]).toContain(id);
  await page.goto('/en/pro');
  await expect(page.getByTestId('verify-banner')).toContainText('Your licence has expired');
  await expect(page.getByTestId('verify-banner')).toContainText('Upload your renewed licence to continue.');
  const { data: pro } = await adminClient().from('professional_profiles').select('verification_status, accepting_patients').eq('user_id', id).single();
  expect(pro).toEqual({ verification_status: 'expired', accepting_patients: false });
});
