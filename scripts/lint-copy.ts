/**
 * Fails when any copy is directive (guardrail 1). See lib/copy/lintCopy.ts.
 *
 *   npm run lint:copy
 */
import { join } from 'node:path';
import { lintCopy } from '../lib/copy/lintCopy';

const { problems, staleAllowed } = lintCopy(join(__dirname, '..'));

for (const p of problems) {
  console.error(`${p.file}  ${p.key}\n  directive wording "${p.phrase}": ${p.text}\n`);
}
for (const k of staleAllowed) {
  console.error(`Allowlist entry no longer needed (remove it from lib/copy/lintCopy.ts): ${k}\n`);
}

if (problems.length || staleAllowed.length) {
  console.error(
    `Copy lint failed. Options and results are information only: no "recommended", "best option" or "you should" (PROJECT.md section 3, guardrail 1).`,
  );
  process.exit(1);
}
console.log('Copy lint passed: no directive wording.');
