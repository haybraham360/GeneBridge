/**
 * Name masking, on the device (task 13, section 4 step 2). Before a family
 * description leaves the browser, personal names become [PERSON_1],
 * [PERSON_2], …; the mapping stays in the browser and the names are put
 * back when the proposed changes come in. Two checks find names:
 *   1. lists: names already on the map, the person's own name, and common
 *      given names (lib/family/names.ts), in Latin and Arabic script;
 *   2. context: a word straight after a kinship word ("my cousin Zubair",
 *      "عمي سعيد"), after "named"/"called"/"اسمه", or before "is my".
 * Pure and dependency-free so it runs in the browser and in tests.
 */
import { ambiguousLatin, arabicKinship, arabicNotNames, englishKinship, englishNotNames, nameList } from './names';

export type NameMap = {
  /** Normalised name → token. */
  tokens: Record<string, string>;
  /** Token → the name as first written. */
  display: Record<string, string>;
  next: number;
};

export function newNameMap(): NameMap {
  return { tokens: {}, display: {}, next: 1 };
}

const ARABIC = /[؀-ۿ]/u;

/** Lower case; Arabic without diacritics and with common letter forms unified. */
export function nameKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

const normalisedList = new Set([...nameList].map(nameKey));
const arabicStop = new Set([...arabicNotNames].map(nameKey));
const arabicKin = new Set([...arabicKinship].map(nameKey));

export function tokenFor(map: NameMap, name: string): string {
  const key = nameKey(name);
  const existing = map.tokens[key];
  if (existing) return existing;
  const token = `[PERSON_${map.next}]`;
  map.next += 1;
  map.tokens[key] = token;
  map.display[token] = name;
  return token;
}

type Word = { text: string; start: number; end: number };

function words(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(/[\p{L}\p{M}]+(?:[-][\p{L}\p{M}]+)*/gu)) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const isCapitalised = (w: string) => /^\p{Lu}\p{Ll}/u.test(w);

/** Arabic words may carry a joined و، ف، ب، ل (and), as in "وخالد". */
function arabicCore(word: string): { core: string; prefix: string } {
  if (word.length > 3 && /^[وفبل]/u.test(word)) {
    const rest = word.slice(1);
    if (normalisedList.has(nameKey(rest)) || arabicKin.has(nameKey(rest))) return { core: rest, prefix: word[0] };
  }
  return { core: word, prefix: '' };
}

/** The name words of a label like "Uncle Saeed" or "خالي ماجد" (kinship words dropped). */
export function namesInLabel(label: string): string[] {
  return words(label)
    .map((w) => w.text)
    .filter((w) => (ARABIC.test(w) ? !arabicStop.has(nameKey(w)) : !englishNotNames.has(w.toLowerCase())))
    .filter((w) => w.length >= 2);
}

/**
 * Where the names are in `text`. `known` holds names already on the map and
 * the person's own name; they always count.
 */
export function findNames(text: string, known: Iterable<string> = []): { start: number; end: number; name: string }[] {
  const knownKeys = new Set([...known].map(nameKey).filter(Boolean));
  const list = words(text);
  const found: { start: number; end: number; name: string }[] = [];

  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    const prev = list[i - 1]?.text ?? '';
    const between = i > 0 ? text.slice(list[i - 1].end, w.start) : '';
    const sentenceStart = i === 0 || /[.!?؟\n]/u.test(between);
    let name: string | null = null;
    let offset = 0;

    if (ARABIC.test(w.text)) {
      const { core, prefix } = arabicCore(w.text);
      const key = nameKey(core);
      if (arabicStop.has(key) || key.startsWith('ال')) continue;
      const prevKey = nameKey(arabicCore(prev).core);
      if (knownKeys.has(key) || normalisedList.has(key) || (arabicKin.has(prevKey) && !/[.،,؟!]/u.test(between) && core.length >= 2)) {
        name = core;
        offset = prefix.length;
      }
    } else {
      const lower = w.text.toLowerCase();
      if (englishNotNames.has(lower)) continue;
      const cap = isCapitalised(w.text);
      const listed = normalisedList.has(lower) && (!ambiguousLatin.has(lower) || (cap && !sentenceStart));
      const prevLower = prev.toLowerCase();
      const afterKin = englishKinship.has(prevLower) && /^[\s,]*$/u.test(between);
      const afterNamed = ['named', 'called'].includes(prevLower);
      const next1 = list[i + 1]?.text.toLowerCase();
      const next2 = list[i + 2]?.text.toLowerCase();
      const beforeIsMy = cap && (next1 === 'is' || next1 === 'was') && next2 === 'my';
      const contextual = cap && w.text.length >= 2 && !/^\p{Lu}+$/u.test(w.text) && (afterKin || afterNamed || beforeIsMy);
      if (knownKeys.has(lower) || listed || contextual) name = w.text;
    }

    if (name) found.push({ start: w.start + offset, end: w.start + offset + name.length, name });
  }
  return found;
}

/** Replaces every name with its token. The map is updated in place and stays in the browser. */
export function maskText(text: string, map: NameMap, known: Iterable<string> = []): string {
  const names = findNames(text, known);
  let out = '';
  let at = 0;
  for (const n of names) {
    out += text.slice(at, n.start) + tokenFor(map, n.name);
    at = n.end;
  }
  return out + text.slice(at);
}

export function unmaskText(text: string, map: NameMap): string {
  return text.replace(/\[PERSON_\d{1,2}\]/g, (t) => map.display[t] ?? t);
}

/** True when any of `names` appears in `text` as a whole word (for tests and the eval). */
export function containsAnyName(text: string, names: string[]): boolean {
  const keyText = nameKey(text);
  return names.some((n) => {
    const k = nameKey(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}])${k}($|[^\\p{L}])`, 'u').test(keyText);
  });
}
