/**
 * Auth flow (task 03). Needs Supabase env vars, the migration and the seed
 * (`npm run seed:auth`). See README.md.
 *
 * Email: the form is filled in for real, the send request is answered locally
 * (no real email), and the magic link is minted with the service role and
 * opened through the app's own /auth/callback. That exercises the same server
 * path as clicking the link in an inbox.
 */
import { expect, test, type Page } from '@playwright/test';
import { DEMO_OTP, DEMO_SIGNUP_PHONE } from '../../lib/auth/demoUsers';
import { adminClient, findUserId, hasSupabase, persona } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

const phoneEnabled = process.env.PHONE_AUTH_ENABLED === 'true';
const SIGNUP_EMAIL = 'signup-test@demo.genebridge.app';
const SIGNUP_PASSWORD = 'synthetic-demo-pass-42';

/** Fill in the email form and reach "Check your inbox" without sending real email. */
async function requestEmailLink(page: Page, email: string) {
  await page.route('**/auth/v1/otp**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  if (phoneEnabled) await page.getByRole('button', { name: /Use email instead/ }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
}

/** Open a real magic link for `email` in this browser, via /auth/callback. */
async function openMagicLink(page: Page, email: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) throw error;
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  await page.goto(`/en/auth/callback?${params}`);
}

/** Reset whether a user has a password / was offered one, for repeatable runs. */
async function resetPasswordState(email: string, state: { dismissed: boolean }) {
  const id = await findUserId({ email });
  if (!id) throw new Error(`No user ${email}`);
  await adminClient().auth.admin.updateUserById(id, {
    user_metadata: { has_password: false, password_prompt_dismissed: state.dismissed },
  });
}

test('visiting /home signed out redirects to /auth', async ({ page }) => {
  await page.goto('/en/home');
  await expect(page).toHaveURL(/\/en\/auth\?next=%2Fhome$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your account');
});

test('the email form shows the "Check your inbox" state', async ({ page }) => {
  await page.goto('/en/auth');
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await requestEmailLink(page, 'someone@example.com');
  await expect(page.getByText('someone@example.com')).toBeVisible();
  await page.getByRole('button', { name: 'Use a different email' }).click();
  await expect(page.getByLabel('Email address')).toHaveValue('');
});

test('sign up by email stores consent and lands on /onboarding', async ({ page }) => {
  const existing = await findUserId({ email: SIGNUP_EMAIL });
  if (existing) await adminClient().auth.admin.deleteUser(existing);

  await page.goto('/en/auth');
  // Consent is required on Create account.
  await page.getByLabel('Email address').fill(SIGNUP_EMAIL);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByText('Please tick this box to create your account.')).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeFocused();
  await page.getByRole('checkbox').check();
  await requestEmailLink(page, SIGNUP_EMAIL);

  // The real send would create the account with the page's locale; do the same.
  const { error } = await adminClient().auth.admin.createUser({
    email: SIGNUP_EMAIL,
    email_confirm: true,
    user_metadata: { locale: 'en' },
  });
  expect(error).toBeNull();

  await openMagicLink(page, SIGNUP_EMAIL);

  // After an email-link sign-up, people are offered a password for next time.
  await expect(page).toHaveURL(/\/en\/auth\/password\?next=%2Fonboarding$/);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Choose a password with at least 8 characters.')).toBeVisible();
  await page.getByLabel('New password').fill(SIGNUP_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/\/en\/onboarding$/);

  const userId = await findUserId({ email: SIGNUP_EMAIL });
  const { data: consents } = await adminClient()
    .from('consents')
    .select('kind, granted_at')
    .eq('user_id', userId!)
    .eq('kind', 'terms');
  expect(consents).toHaveLength(1);
  expect(consents?.[0].granted_at).toBeTruthy();

  const { data: profile } = await adminClient()
    .from('profiles')
    .select('locale, role, onboarding_step')
    .eq('user_id', userId!)
    .single();
  expect(profile).toEqual({ locale: 'en', role: 'individual', onboarding_step: 0 });

  const { data: events } = await adminClient()
    .from('events')
    .select('name, props')
    .eq('user_id', userId!);
  expect(events?.map((e) => e.name).sort()).toEqual(
    ['auth_method_selected', 'consent_given', 'sign_up_completed'].sort(),
  );
  expect(JSON.stringify(events)).not.toContain(SIGNUP_EMAIL);

  // Sign out, then back in with the new password.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/en\/auth$/);
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Sign in with a password instead' }).click();
  await page.getByLabel('Email address').fill(SIGNUP_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(SIGNUP_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/onboarding$/);
});

test('a wrong password and an unknown email get the same message', async ({ page }) => {
  const message = "That email and password don't match.";
  await page.goto('/en/auth');
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Sign in with a password instead' }).click();
  // No password field on Create account: sign-up is by email link.
  for (const email of [persona('mariam').email, 'nobody-here@demo.genebridge.app']) {
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  }
  await page.getByRole('tab', { name: 'Create account' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
});

test('a returning user signs in by email and lands on /dashboard', async ({ page }) => {
  await page.goto('/en/auth');
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back');
  await expect(page.getByRole('checkbox')).toHaveCount(0);

  await resetPasswordState(persona('mariam').email, { dismissed: false });
  await requestEmailLink(page, persona('mariam').email);
  await openMagicLink(page, persona('mariam').email);
  await expect(page).toHaveURL(/\/en\/auth\/password\?next=%2Fdashboard$/);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);

  // Signed-in users visiting /auth are sent on.
  await page.goto('/en/auth');
  await expect(page).toHaveURL(/\/en\/dashboard$/);

  // Sign out from the placeholder home page (it still has the button).
  await page.goto('/en/home');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/en\/auth$/);
  await page.goto('/en/home');
  await expect(page).toHaveURL(/\/en\/auth\?next=%2Fhome$/);
});

test('the UAE PASS mock signs in as a seeded user', async ({ page }) => {
  await page.goto('/en/auth');
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Continue with UAE PASS' }).click();
  const dialog = page.getByRole('dialog', { name: 'Demo: UAE PASS' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Khalid/ }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
});

test('the UAE PASS mock offers every persona; the counsellor lands on /pro', async ({ page }) => {
  await page.goto('/en/auth');
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Continue with UAE PASS' }).click();
  const dialog = page.getByRole('dialog', { name: 'Demo: UAE PASS' });
  for (const name of ['Mariam', 'Khalid', 'Patient R.', 'Dr. Amaka Okoro']) {
    await expect(dialog.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  }
  await dialog.getByRole('button', { name: /Dr\. Amaka Okoro/ }).click();
  await expect(page).toHaveURL(/\/en\/pro$/);
});

test('a sign-in link that lands on the home page still signs in', async ({ page }) => {
  // What happens when the callback URL is missing from Supabase's redirect list.
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: persona('patientR').email,
  });
  if (error) throw error;
  await page.goto(`/en?token_hash=${data.properties.hashed_token}&type=magiclink`);
  await expect(page).toHaveURL(/\/en\/dashboard$/);
});

test('the Google button only shows when the provider is on', async ({ page, request }) => {
  const settings = await request
    .get(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    })
    .then((r) => r.json());
  await page.goto('/en/auth');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(
    settings.external.google ? 1 : 0,
  );
});

test('signed-out return address is kept after sign-in', async ({ page }) => {
  await resetPasswordState(persona('khalid').email, { dismissed: true });
  await page.goto('/en/simulator');
  await expect(page).toHaveURL(/next=%2Fsimulator/);
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await requestEmailLink(page, persona('khalid').email);
  await openMagicLink(page, persona('khalid').email);
  await expect(page).toHaveURL(/\/en\/simulator$/);
});

test('a valid facility code makes the account a counsellor', async ({ page }) => {
  const email = 'facility-test@demo.genebridge.app';
  const existing = await findUserId({ email });
  if (existing) await adminClient().auth.admin.deleteUser(existing);
  await adminClient().auth.admin.createUser({ email, email_confirm: true });

  await page.goto('/en/auth');
  await page.getByRole('button', { name: 'Sign in with a facility code' }).click();
  await page.getByLabel('Facility code').fill('GB-WRONG-999');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByText("That facility code didn't work.")).toBeVisible();

  await page.getByLabel('Facility code').fill('gb-demo-001');
  await requestEmailLink(page, email);
  await openMagicLink(page, email);
  // New account: consent is asked for before anything else.
  await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/en\/auth\/password\?next=%2Fpro$/);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/en\/pro$/);

  const userId = await findUserId({ email });
  const { data } = await adminClient()
    .from('profiles')
    .select('role')
    .eq('user_id', userId!)
    .single();
  expect(data?.role).toBe('counsellor');
});

test('arrow keys move between tabs @mobile', async ({ page }) => {
  await page.goto('/en/auth');
  await page.getByRole('tab', { name: 'Create account' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Sign in' })).toBeFocused();
});

test.describe('phone sign-in', () => {
  test.skip(!phoneEnabled, 'Phone sign-in is off (PHONE_AUTH_ENABLED)');
  const national = (phone: string) => phone.replace(/^971/, '');

  test('sign up with the test phone lands on /onboarding', async ({ page }) => {
    const existing = await findUserId({ phone: DEMO_SIGNUP_PHONE });
    if (existing) await adminClient().auth.admin.deleteUser(existing);
    await page.goto('/en/auth');
    await page.getByRole('checkbox').check();
    await page.getByLabel('Mobile number').fill(national(DEMO_SIGNUP_PHONE));
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await page.getByLabel('Digit 1 of 6').fill(DEMO_OTP);
    await expect(page).toHaveURL(/\/en\/onboarding$/);
  });

  test('a returning user signs in with their phone and lands on /dashboard', async ({ page }) => {
    await page.goto('/en/auth');
    await page.getByRole('tab', { name: 'Sign in' }).click();
    await page.getByLabel('Mobile number').fill(national(persona('mariam').phone));
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await page.getByLabel('Digit 1 of 6').fill(DEMO_OTP);
    await expect(page).toHaveURL(/\/en\/dashboard$/);
  });
});
