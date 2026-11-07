import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: './tests/e2e',
  // Auth tests share seeded users and Supabase rate limits: run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Set PW_CHANNEL=chrome to use an installed Chrome instead of Playwright's download.
    channel: process.env.PW_CHANNEL,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // The tests sign in with the demo personas (UAE PASS mock), a demo helper.
    env: { NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE ?? 'true' },
  },
});
