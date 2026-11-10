/**
 * Care near you (docs/nearby-care.md). Needs the nearby_care migration and
 * `npm run seed:auth`. Signs in as Mariam through the app's own callback.
 * Device location is mocked; the map is never opened, so no tiles load.
 */
import { expect, test, type Page } from '@playwright/test';
import { adminClient, hasSupabase, persona } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

async function signIn(page: Page) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: persona('mariam').email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  await page.goto(`/en/auth/callback?${params}`);
  await page.waitForURL(/\/en\/(dashboard|onboarding|auth\/password)/);
}

/** Every server action body the page sends, to check no precise point leaves the browser. */
function recordPosts(page: Page): string[] {
  const bodies: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') bodies.push(req.postData() ?? '');
  });
  return bodies;
}

test('device location: rounded before it leaves the browser, results listed nearest first', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 24.453884, longitude: 54.377344 });
  await signIn(page);
  const posts = recordPosts(page);

  await page.goto('/en/dashboard/nearby');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Care near you');
  await expect(page.getByText('We never store it or share it.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Use my location' }).click();

  await expect(page.getByText('Near your location')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /within 25 km/ })).toBeVisible();
  await expect(page.getByText('Something went wrong. Please try again.')).toHaveCount(0);

  const sent = posts.join('\n');
  expect(sent).toContain('24.45');
  expect(sent).not.toContain('24.4538');
  expect(sent).not.toContain('54.3773');

  // Distances, if any results, are listed nearest first.
  const distances = await page.getByTestId('nearby-item').evaluateAll((items) =>
    items.map((el) => {
      const text = el.textContent ?? '';
      return text.includes('Less than 1 km away') ? 0 : Number(text.match(/About ([\d.]+) km away/)?.[1] ?? NaN);
    }),
  );
  expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  await expect(page.getByTestId('nearby-map')).toHaveCount(0);
});

test('location denied falls back to choosing an area', async ({ page, context }) => {
  await context.clearPermissions();
  await signIn(page);
  await page.goto('/en/dashboard/nearby');
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByText('Choose an area to see care near you.')).toBeVisible();

  await page.getByLabel('Or pick an area in the UAE').selectOption('abu_dhabi_city');
  await page.getByRole('button', { name: 'Show care near this area' }).click();
  await expect(page.getByText('Near Abu Dhabi city')).toBeVisible();
  // The placeholder services in Abu Dhabi have map points.
  await expect(page.locator('[data-testid="nearby-item"][data-type="service"]').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /^Directions to / }).first()).toHaveAttribute('href', /destination=/);
  await expect(page.getByRole('link', { name: /^Directions to / }).first()).not.toHaveAttribute('href', /origin=/);
});

test('worldwide: a device location outside the UAE is searched, and a typed place is found', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 51.507351, longitude: -0.127758 });
  await signIn(page);
  const posts = recordPosts(page);
  await page.goto('/en/dashboard/nearby');
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByText('Near your location')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /within 25 km/ })).toBeVisible();
  // The search itself succeeded (no "Something went wrong").
  await expect(page.getByText('Something went wrong. Please try again.')).toHaveCount(0);
  expect(posts.join('\n')).toContain('51.51');
  expect(posts.join('\n')).not.toContain('51.5073');

  // Place search goes through our server to the geocoder.
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Search for a city, area or address').fill('Manchester, United Kingdom');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const first = page.getByTestId('place-results').getByRole('button').first();
  await expect(first).toContainText('Manchester');
  await first.click();
  await expect(page.getByText(/^Near Manchester/)).toBeVisible();
  await expect(page.getByText('Something went wrong. Please try again.')).toHaveCount(0);
});

test('Arabic mirrors, and the entry links are on Services and the directory', async ({ page }) => {
  await signIn(page);
  await page.goto('/ar/dashboard/nearby');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('رعاية قريبة منك');

  await page.goto('/en/dashboard/services');
  await expect(page.getByTestId('nearby-entry')).toHaveAttribute('href', '/en/dashboard/nearby?from=services');
  await page.goto('/en/dashboard/counsellor');
  await expect(page.getByTestId('nearby-entry')).toHaveAttribute('href', '/en/dashboard/nearby?from=directory');
});
