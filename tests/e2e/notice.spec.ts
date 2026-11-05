/**
 * The relative's family notice page (task 08, section 8). Needs the task 08
 * migration and `npm run seed:auth`. Re-seeds the demo notices.
 */
import { expect, test, type Page } from '@playwright/test';
import { demoNotices } from '../../lib/notices/demo';
import { hashPhoneWith } from '../../lib/notices/phoneFormat';
import { noticeSalt, seedNotices } from '../../scripts/lib/noticeSeed';
import { adminClient, findUserId, hasSupabase, persona } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

const code = (key: (typeof demoNotices)[number]['key']) => demoNotices.find((n) => n.key === key)!.code;
const withCondition = `/en/family-notice/${code('withCondition')}`;

test.beforeEach(async () => {
  await seedNotices(adminClient());
});

test.afterAll(async () => {
  await seedNotices(adminClient());
});

/** Records every request that leaves our own origin. */
function watchThirdParty(page: Page, origin: string) {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (new URL(url).origin !== origin) outside.push(url);
  });
  return outside;
}

/** Captures what Listen reads, without real speech. */
async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    class FakeUtterance {
      text: string;
      lang = '';
      voice = null;
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: (u: FakeUtterance) => spoken.push(`${u.lang}|${u.text}`),
        cancel: () => {},
        getVoices: () => [],
      },
    });
  });
}

test('the page, its JSON and its headers never reveal the sender', async ({ request }) => {
  const mariam = persona('mariam');
  const senderId = await findUserId({ email: mariam.email });
  const response = await request.get(withCondition);
  expect(response.status()).toBe(200);

  const headers = response.headers();
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['set-cookie']).toBeUndefined();

  const html = await response.text();
  const everything = `${JSON.stringify(headers)}\n${html}`;
  const secrets = [senderId!, mariam.email, mariam.phone, `+${mariam.phone}`, hashPhoneWith(noticeSalt(), demoNotices[0].phone)];
  for (const secret of secrets) expect(everything, `leaks ${secret}`).not.toContain(secret);
  // The sender's name and their family-map labels (PROJECT.md section 10).
  for (const name of ['Mariam', 'Khalid', 'Saeed', 'Ahmed', 'Huda', 'Yousef', 'Rashid', 'Fatima', 'Noura', 'Ali']) {
    expect(everything, `mentions ${name}`).not.toMatch(new RegExp(`\\b${name}\\b`));
  }
  expect(everything).not.toMatch(/مريم|خالد|سعيد/);
});

test('invalid and valid codes answer with the same status; expired hides the condition', async ({ request }) => {
  const valid = await request.get(withCondition);
  const invalid = await request.get(`/en/family-notice/${'z'.repeat(32)}`);
  const malformed = await request.get('/en/family-notice/abc');
  expect(invalid.status()).toBe(valid.status());
  expect(malformed.status()).toBe(valid.status());
  expect(await invalid.text()).toContain('This link isn');

  const expired = await request.get(`/en/family-notice/${code('expired')}`);
  expect(expired.status()).toBe(200);
  const expiredHtml = await expired.text();
  expect(expiredHtml).toContain('This message has expired');
  expect(expiredHtml).not.toMatch(/Sickle cell|sickle_cell/);
});

test('anonymous notice with a condition in English and Arabic, with Listen', async ({ page, baseURL }) => {
  const outside = watchThirdParty(page, new URL(baseURL!).origin);
  await fakeSpeech(page);

  await page.goto(withCondition);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("A message about your family's health");
  await expect(page.getByText('They chose not to share their name')).toBeVisible();
  await expect(page.getByText('Sickle cell', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'What is sickle cell?' })).toBeVisible();
  await expect(page.getByText('Being a carrier is common')).toBeVisible();

  await page.getByRole('button', { name: 'Listen' }).click();
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spoken.at(-1)).toMatch(/^en-GB\|A message about your family's health\./);
  expect(spoken.at(-1)).toContain('Being a carrier is common');

  await page.getByRole('link', { name: 'العربية' }).click();
  await expect(page).toHaveURL(new RegExp(`/ar/family-notice/${code('withCondition')}$`));
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('رسالة عن صحة عائلتك');
  await expect(page.getByText('فقر الدم المنجلي', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'استمع' }).click();
  const spokenAr = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spokenAr.at(-1)).toMatch(/^ar-SA\|رسالة عن صحة عائلتك/);

  expect(outside, 'requests outside our domain').toEqual([]);
});

test('the notice without a condition says so', async ({ page }) => {
  await page.goto(`/ar/family-notice/${code('withoutCondition')}`);
  await expect(page.getByText('لم يذكر حالة محددة')).toBeVisible();
});

test('"Find free, confidential testing" shows services, with no third-party requests', async ({ page, baseURL }) => {
  const outside = watchThirdParty(page, new URL(baseURL!).origin);
  await page.goto(withCondition);
  await page.getByRole('link', { name: 'Find free, confidential testing' }).click();
  await expect(page).toHaveURL(/\/en\/family-notice\/testing$/);
  const services = page.getByTestId('testing-services').getByRole('listitem');
  await expect(services.first()).toBeVisible();
  await expect(page.getByText('[Premarital screening centre]')).toBeVisible();
  await expect(page.getByText('[Genetic counselling clinic A]')).toBeVisible();
  expect(outside).toEqual([]);
});

test('"Stop them" asks, confirms and can be undone', async ({ page }) => {
  await page.goto(withCondition);
  await page.getByRole('link', { name: "Don't want messages like this? Stop them" }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stop messages like this?');
  await page.getByRole('button', { name: 'Stop messages' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("You won't receive more messages like this");
  await expect(page.getByText('Sickle cell', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: "Undo: I'd like to receive them again" }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("A message about your family's health");
});

test('"Report misuse" records a review without showing anything about the sender', async ({ page }) => {
  await page.goto(withCondition);
  await page.getByRole('link', { name: 'Report misuse' }).click();
  await page.getByRole('radio', { name: "I don't think this is from my family" }).check();
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Thank you. We'll review it.");
});

test('the preview matches the real page and shows the Preview banner', async ({ page }) => {
  // Real page first, read as a relative.
  await page.goto(withCondition);
  const real = await page.locator('main').innerText();

  // Then the sender's preview with the same options.
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: persona('mariam').email });
  if (error) throw error;
  await page.goto(`/en/auth/callback?${new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' })}`);
  await page.waitForURL(/\/en\/(dashboard|onboarding|auth\/password)/);
  await page.goto('/en/family-notice/preview?anonymous=1&condition=sickle_cell_disease');
  await expect(page.getByRole('note')).toContainText('Preview: this is exactly what your relatives will see');
  expect(await page.locator('main').innerText()).toBe(real);
});

test('the preview needs sign-in', async ({ request }) => {
  const response = await request.get('/en/family-notice/preview', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain('/en/auth?next=%2Ffamily-notice%2Fpreview');
});
