/**
 * Removes all synthetic analytics data (task 05).
 *
 *   npm run clear:synthetic
 *
 * Deletes every account marked `profiles.is_synthetic = true` (and any
 * half-seeded synthetic account), with their events, consents, couple links
 * and synthetic screening results. Demo personas and real users are kept.
 */
import { adminClient, assertAnalyticsMigration, clearSynthetic } from './lib/synthetic';

async function main() {
  const admin = adminClient();
  await assertAnalyticsMigration(admin);
  console.log('Removing synthetic users…');
  const count = await clearSynthetic(admin);
  console.log(`Removed ${count} synthetic users and their data.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
