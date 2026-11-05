import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

config({ path: '.env.local', quiet: true });

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['tests/rls/**/*.test.ts', 'lib/**/*.test.ts', 'tests/assistant/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    // RLS tests sign in the same demo personas; a new sign-in link cancels the
    // previous one, so test files run one at a time.
    fileParallelism: false,
  },
});
