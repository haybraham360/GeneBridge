/** Every sentence an explanation says aloud, in reading order. Pure: used in the browser. */
import type { Explanation } from './types';

export function spokenSentences(explanation: Explanation, simple: boolean, selectedKey?: string | null): string[] {
  const parts = [...(simple ? explanation.summarySimple : explanation.summary)];
  for (const f of explanation.findings) {
    if (selectedKey && f.key !== selectedKey) continue;
    parts.push(...(simple ? f.simple : f.sentences));
  }
  return parts;
}
