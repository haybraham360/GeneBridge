/**
 * Blind Match (task 17) in the browser: two people on two devices. One
 * shows a code, the other types it, both agree, both see the same answer,
 * and a mutual reveal names the condition. Throwaway accounts with
 * synthetic results, removed after. Set BM_SHOTS=<dir> to save screenshots.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { adminClient, deleteTestUser, hasSupabase } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

const run = Date.now();
const users = {
  amal: { email: `bm-ui-amal-${run}@example.test`, name: 'Amal', id: '' },
  badr: { email: `bm-ui-badr-${run}@example.test`, name: 'Badr', id: '' },
};

test.beforeAll(async () => {
  const admin = adminClient();
  for (const [key, u] of Object.entries(users)) {
    const { data, error } = await admin.auth.admin.createUser({ email: u.email, email_confirm: true, user_metadata: { display_name: u.name, locale: 'en' } });
    if (error) throw error;
    u.id = data.user.id;
    await admin.from('profiles').update({ display_name: u.name, locale: 'en', onboarding_step: 8 }).eq('user_id', u.id);
    await admin.from('consents').insert({ user_id: u.id, kind: 'terms' });
    await admin.from('screening_results').insert(
      ['beta_thalassemia', 'cystic_fibrosis'].map((condition_code, i) => ({
        owner_id: u.id,
        reference_code: `BMUI-${key.toUpperCase()}-${run}`,
        condition_code,
        status: i === 0 ? 'carrier' : 'no_variant',
        flagged: false,
        claimed_at: new Date().toISOString(),
        is_demo: true,
      })),
    );
  }
});

test.afterAll(async () => {
  for (const u of Object.values(users)) {
    if (!u.id) continue;
    // Claimed results block deleting the account (owner_id is set null on delete), so remove them first.
    await adminClient().from('screening_results').delete().eq('owner_id', u.id);
    await deleteTestUser(u.id);
  }
});

async function device(browser: Browser, email: string): Promise<Page> {
  // BM_WIDTH=390 checks the phone layout.
  const width = Number(process.env.BM_WIDTH ?? 1280);
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, isMobile: width < 600, hasTouch: width < 600 });
  const page = await context.newPage();
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  await page.goto(`/en/auth/callback?${new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' })}`);
  await page.goto('/en/dashboard/blind-match');
  return page;
}

async function shot(page: Page, name: string) {
  if (process.env.BM_SHOTS) await page.screenshot({ path: `${process.env.BM_SHOTS}/${name}.png`, fullPage: true });
}

test('two people check together and see one answer', async ({ browser }) => {
  test.setTimeout(180_000);
  const amal = await device(browser, users.amal.email);
  const badr = await device(browser, users.badr.email);

  await expect(amal.getByTestId('blind-match-start')).toBeVisible();
  await expect(amal.getByText('blindMatch.')).toHaveCount(0); // every string translated
  await shot(amal, '1-home');

  // Amal shows a code.
  await amal.getByRole('button', { name: 'Show my code' }).click();
  const codeText = (await amal.getByTestId('blind-match-code-text').textContent())!.trim();
  expect(codeText).toMatch(/^[A-Z2-9]{3} [A-Z2-9]{3}$/);
  await shot(amal, '2-code');

  // Badr types it in.
  await badr.getByRole('button', { name: 'I have a code' }).click();
  await badr.getByLabel('Code').fill(codeText);
  await shot(badr, '3-join');
  await badr.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(badr.getByTestId('blind-match-agree')).toBeVisible();
  await expect(badr.getByText('Checking with Amal')).toBeVisible();

  // Amal's screen moves on by itself once Badr joins.
  await expect(amal.getByTestId('blind-match-agree')).toBeVisible({ timeout: 10_000 });
  await expect(amal.getByText('Checking with Badr')).toBeVisible();

  // "I agree" needs the understanding box first.
  const agree = badr.getByRole('button', { name: 'I agree' });
  await expect(agree).toBeDisabled();
  await badr.getByLabel(/understand what the answer can tell us/).check();
  await shot(badr, '4-agree');
  await agree.click();
  await expect(amal.getByText('Badr agreed. Tap I agree to see your answer.')).toBeVisible({ timeout: 10_000 });
  await shot(amal, '5-other-agreed');

  await amal.getByLabel(/understand what the answer can tell us/).check();
  await amal.getByRole('button', { name: 'I agree' }).click();

  // Both see the same answer.
  await expect(amal.getByTestId('blind-match-answer-shared')).toBeVisible();
  await expect(badr.getByTestId('blind-match-answer-shared')).toBeVisible({ timeout: 10_000 });
  await shot(amal, '6-answer');

  // Mutual reveal.
  await amal.getByRole('button', { name: 'Show us which condition' }).click();
  await expect(amal.getByText(/It will appear if the other person asks too/)).toBeVisible();
  await badr.getByRole('button', { name: 'Show us which condition' }).click();
  await expect(badr.getByText('Beta-thalassaemia')).toBeVisible();
  await expect(amal.getByText('Beta-thalassaemia')).toBeVisible({ timeout: 10_000 });
  await shot(amal, '7-revealed');

  await amal.context().close();
  await badr.context().close();
});
