/**
 * Guardrail 1 (PROJECT.md section 3): copy is never directive. Checks every
 * string in messages/{en,ar} and content/library/{en,ar} with the same
 * directive rule the assistant's replies must pass, so static copy and AI
 * replies are held to one standard.
 *
 * Run with `npm run lint:copy`; `npm run build` runs it first.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findDirective } from '../assistant/outputCheck';

export const copyRoots = ['messages', 'content/library'] as const;

/**
 * Strings that are allowed to contain a matched phrase. Each needs a reason,
 * and none may be patient-facing copy about results, the couple view or options.
 * Key: "<file relative to the repo root>#<dotted.key.path>".
 */
export const allowed: Record<string, string> = {
  'messages/en/verify.json#flow.selfie.title':
    'Professional KYC step: "recommended" describes an optional selfie, not a patient option.',
};

export type CopyProblem = { file: string; key: string; phrase: string; text: string };

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return jsonFiles(path);
      return name.endsWith('.json') ? [path] : [];
    });
}

function strings(value: unknown, key = ''): [string, string][] {
  if (typeof value === 'string') return [[key, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, key ? `${key}.${i}` : String(i)));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, key ? `${key}.${k}` : k));
  }
  return [];
}

/** Directive wording in one parsed copy file. */
export function lintCopyFile(file: string, json: unknown): CopyProblem[] {
  const problems: CopyProblem[] = [];
  for (const [key, text] of strings(json)) {
    if (`${file}#${key}` in allowed) continue;
    const phrase = findDirective(text);
    if (phrase) problems.push({ file, key, phrase, text });
  }
  return problems;
}

/** Directive wording across all copy, plus allowlist entries that no longer match anything. */
export function lintCopy(root: string): { problems: CopyProblem[]; staleAllowed: string[] } {
  const problems: CopyProblem[] = [];
  const seen = new Set<string>();
  for (const dir of copyRoots) {
    for (const path of jsonFiles(join(root, dir))) {
      const file = relative(root, path).split('\\').join('/');
      const json: unknown = JSON.parse(readFileSync(path, 'utf8'));
      problems.push(...lintCopyFile(file, json));
      for (const [key, text] of strings(json)) {
        if (`${file}#${key}` in allowed && findDirective(text)) seen.add(`${file}#${key}`);
      }
    }
  }
  return { problems, staleAllowed: Object.keys(allowed).filter((k) => !seen.has(k)) };
}
