/**
 * Runs the SQL tests in supabase/tests/ against the database (task 05).
 *
 *   npm run test:sql
 *
 * Needs psql and SUPABASE_DB_URL in .env.local (Supabase → Connect → Session
 * pooler). Each test file runs in a transaction that is rolled back.
 */
import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local', quiet: true });

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Set SUPABASE_DB_URL in .env.local (Supabase → Connect → Session pooler).');
  process.exit(1);
}

const dir = join('supabase', 'tests');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let failed = false;

for (const file of files) {
  console.log(`\n${file}`);
  const run = spawnSync('psql', [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', join(dir, file)], {
    encoding: 'utf8',
  });
  if (run.error) {
    console.error(`Could not run psql: ${run.error.message}`);
    process.exit(1);
  }
  const output = `${run.stdout}${run.stderr}`
    .split('\n')
    .map((line) => line.replace(/^psql:[^ ]+ /, '').replace(/^NOTICE:\s+/, '  '))
    .filter(Boolean)
    .join('\n');
  console.log(output);
  if (run.status !== 0) failed = true;
}

console.log(failed ? '\nSQL tests failed.' : '\nSQL tests passed.');
process.exit(failed ? 1 : 0);
