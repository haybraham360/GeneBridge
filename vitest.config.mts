import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: '.env.local', quiet: true });

export default defineConfig({
  test: {
    include: ['tests/rls/**/*.test.ts', 'lib/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
