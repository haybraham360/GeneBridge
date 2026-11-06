/**
 * The rule-based planner (task 13): reads a masked family description in
 * English or Arabic with fixed patterns and produces the same operations
 * the model would. Used when no AI key is set (offline mode), in the
 * Playwright tests (FAMILY_TEST_PLANNER=1) and as the eval's offline tier.
 * Deliberately cautious: anything it can't read with confidence is left
 * out or asked about, never guessed.
 */
import arQuestions from '@/content/library/ar/family/questions.json';
import enQuestions from '@/content/library/en/family/questions.json';
import type { Relation } from '../relations';
import type { Side } from '../types';
import type { CompactTree, Op } from './schema';

type Lang = 'en' | 'ar';
const copy = { en: enQuestions, ar: arQuestions };

type Mention = {
  key: string;
  temp: string;
  relation: Relation;
  side: Side;
  token: string | null;
  /** Unclear side: asked about, not added. */
  ambiguous: boolean;
  /**
   * Only implied by a possessive ("my mother's mother" implies a mother).
   * Not added: GeneBridge draws an unknown connector where one is needed.
   */
  implicit: boolean;
  start: number;
};

type Found = {
  mentions: Mention[];
  links: { from: string; to: string; type: 'parent_of' | 'partner_of'; consanguineous: boolean }[];
  conditions: { person: string; words: string; status: 'known' | 'carrier' | 'not_sure' }[];
};

const TOKEN = String.raw`\[PERSON_\d{1,2}\]`;
const HEDGE = /\b(not sure|unsure|maybe|might|i think|i believe|possibly|probably|perhaps|don't know)\b|مش متأكد|مو متأكد|غير متأكد|لست متأكد|يمكن|ربما|أظن|اظن|أعتقد|اعتقد/iu;

/* --------------------------------- English -------------------------------- */

type Step = 'father' | 'mother' | 'brother' | 'sister' | 'son' | 'daughter' | 'husband' | 'wife' | 'partner' | 'uncle' | 'aunt' | 'cousin' | 'grandfather' | 'grandmother' | 'nephew' | 'niece' | 'grandson' | 'granddaughter';

const STEP_WORDS: Record<string, Step> = {
  father: 'father', dad: 'father', mother: 'mother', mum: 'mother', mom: 'mother', brother: 'brother', sister: 'sister',
  son: 'son', daughter: 'daughter', husband: 'husband', wife: 'wife', partner: 'partner', uncle: 'uncle', aunt: 'aunt',
  auntie: 'aunt', cousin: 'cousin', grandfather: 'grandfather', grandpa: 'grandfather', grandmother: 'grandmother',
  grandma: 'grandmother', granny: 'grandmother', nephew: 'nephew', niece: 'niece', grandson: 'grandson', granddaughter: 'granddaughter',
};
const STEP_RE = Object.keys(STEP_WORDS).sort((a, b) => b.length - a.length).join('|');

/** A chain like father → brother as a relation to the owner, or null if too far. */
function chainRelation(steps: Step[]): { relation: Relation; side: Side } | null {
  const [a, b, c] = steps;
  const sideOf = (s: Step): Side => (s === 'father' ? 'paternal' : 'maternal');
  if (steps.length === 1) {
    const simple: Partial<Record<Step, Relation>> = {
      father: 'father', mother: 'mother', brother: 'brother', sister: 'sister', son: 'son', daughter: 'daughter',
      husband: 'husband', wife: 'wife', partner: 'partner', uncle: 'uncle', aunt: 'aunt', cousin: 'cousin',
      grandfather: 'grandfather', grandmother: 'grandmother', nephew: 'nephew', niece: 'niece', grandson: 'grandson', granddaughter: 'granddaughter',
    };
    return simple[a] ? { relation: simple[a]!, side: 'none' } : null;
  }
  if (steps.length === 2 && (a === 'father' || a === 'mother')) {
    const map: Partial<Record<Step, Relation>> = { father: 'grandfather', mother: 'grandmother', brother: 'uncle', sister: 'aunt', son: 'cousin', daughter: 'cousin' };
    if (b === 'son' || b === 'daughter') return null; // A sibling, said the long way round.
    return map[b] ? { relation: map[b]!, side: sideOf(a) } : null;
  }
  if (steps.length === 2 && (a === 'brother' || a === 'sister')) {
    if (b === 'son') return { relation: 'nephew', side: 'none' };
    if (b === 'daughter') return { relation: 'niece', side: 'none' };
  }
  if (steps.length === 2 && (a === 'son' || a === 'daughter')) {
    if (b === 'son') return { relation: 'grandson', side: 'none' };
    if (b === 'daughter') return { relation: 'granddaughter', side: 'none' };
  }
  if (steps.length === 2 && (a === 'husband' || a === 'wife' || a === 'partner')) {
    if (b === 'father') return { relation: 'partner_father', side: 'none' };
    if (b === 'mother') return { relation: 'partner_mother', side: 'none' };
  }
  if (steps.length === 3 && (a === 'father' || a === 'mother') && (b === 'brother' || b === 'sister') && (c === 'son' || c === 'daughter')) {
    return { relation: 'cousin', side: sideOf(a) };
  }
  return null;
}

const SIDED: ReadonlySet<Relation> = new Set(['uncle', 'aunt', 'cousin', 'grandfather', 'grandmother', 'grandparent', 'uncle_or_aunt']);

function sentenceSide(sentence: string): Side {
  if (/\b(father'?s|dad'?s|paternal)\s+(side|family)|\bpaternal\b/i.test(sentence)) return 'paternal';
  if (/\b(mother'?s|mum'?s|mom'?s|maternal)\s+(side|family)|\bmaternal\b/i.test(sentence)) return 'maternal';
  return 'none';
}

class Builder {
  found: Found = { mentions: [], links: [], conditions: [] };
  private n = 0;
  constructor(private readonly forcedSide: Side | 'unsure' | null) {}

  mention(key: string, relation: Relation, side: Side, token: string | null, start: number, implicit = false): Mention {
    const existing = this.found.mentions.find((m) => m.key === key || (token && m.token === token));
    if (existing) {
      if (token && !existing.token) existing.token = token;
      if (!implicit || token) existing.implicit = false;
      return existing;
    }
    let rel = relation;
    let s = side;
    let ambiguous = SIDED.has(relation) && side === 'none';
    if (ambiguous && this.forcedSide) {
      if (this.forcedSide === 'unsure') rel = 'relative';
      else s = this.forcedSide;
      ambiguous = false;
    }
    this.n += 1;
    const m: Mention = { key, temp: `m${this.n}`, relation: rel, side: s, token, ambiguous, implicit: implicit && !token, start };
    this.found.mentions.push(m);
    return m;
  }

  /** Every prefix of a chain is a person: "my father's brother" mentions the father too. */
  chain(steps: Step[], token: string | null, start: number, sentence: string): Mention | null {
    let last: Mention | null = null;
    for (let i = 1; i <= steps.length; i++) {
      const rel = chainRelation(steps.slice(0, i));
      if (!rel) return last;
      const side = rel.side !== 'none' ? rel.side : SIDED.has(rel.relation) ? sentenceSide(sentence) : 'none';
      const key = steps.slice(0, i).join('>') + (i === 1 && SIDED.has(rel.relation) ? `@${side}` : '');
      // Later links in the chain sit later in the text, so "is deaf" attaches to the son, not the sister.
      const m = this.mention(key, rel.relation, side, i === steps.length ? token : null, start + i - 1, i < steps.length);
      // A cousin, nephew or grandchild named through a chain: link them to that parent.
      if (last && ['cousin', 'nephew', 'niece', 'grandson', 'granddaughter', 'partner_father', 'partner_mother'].includes(rel.relation)) {
        if (rel.relation === 'partner_father' || rel.relation === 'partner_mother') this.link(m.temp, last.temp);
        else this.link(last.temp, m.temp);
      }
      last = m;
    }
    return last;
  }

  link(from: string, to: string, type: 'parent_of' | 'partner_of' = 'parent_of', consanguineous = false) {
    if (from === to) return;
    if (!this.found.links.some((l) => l.from === from && l.to === to && l.type === type)) this.found.links.push({ from, to, type, consanguineous });
  }

  condition(person: Mention | undefined, words: string, status: 'known' | 'carrier' | 'not_sure') {
    const w = words.trim().replace(/^(a|an|the)\s+/i, '').replace(/\s+(too|as well)$/i, '').trim();
    if (!person || !w || w.length > 80) return;
    person.implicit = false;
    this.found.conditions.push({ person: person.temp, words: w, status });
  }

  lastBefore(index: number, from = 0): Mention | undefined {
    return [...this.found.mentions].filter((m) => m.start <= index && m.start >= from).sort((a, b) => b.start - a.start)[0];
  }
}

function parseEnglish(text: string, b: Builder) {
  const sentences = [...text.matchAll(/[^.!?\n]+[.!?\n]*/g)];
  for (const s of sentences) {
    const sentence = s[0];
    const base = s.index;
    const hedged = HEDGE.test(sentence);

    // "my father's brother, [PERSON_2]" / "my husband [PERSON_3]"
    const chainRe = new RegExp(String.raw`\bmy\s+((?:(?:${STEP_RE})(?:'s|’s)\s+)*(?:${STEP_RE}))\b(?:,?\s+(${TOKEN}))?`, 'gi');
    for (const m of sentence.matchAll(chainRe)) {
      // "[PERSON_1] is my cousin" describes someone already mentioned, handled below.
      if (/\b(?:is|was)\s+(?:also\s+)?$/i.test(sentence.slice(0, m.index))) continue;
      // "on my mother's side" names a side of the family, not a person.
      if (/^(?:'s|’s)\s+(?:side|family)\b/i.test(sentence.slice(m.index + m[0].length))) continue;
      const steps = m[1].toLowerCase().split(/(?:'s|’s)\s+/).map((w) => STEP_WORDS[w.trim()]).filter(Boolean) as Step[];
      b.chain(steps, m[2] ?? null, base + m.index, sentence);
    }
    // "[PERSON_1] is my father's brother"
    const isMyRe = new RegExp(String.raw`(${TOKEN})\s+(?:is|was)\s+(?:also\s+)?my\s+((?:(?:${STEP_RE})(?:'s|’s)\s+)*(?:${STEP_RE}))\b`, 'gi');
    for (const m of sentence.matchAll(isMyRe)) {
      const steps = m[2].toLowerCase().split(/(?:'s|’s)\s+/).map((w) => STEP_WORDS[w.trim()]).filter(Boolean) as Step[];
      b.chain(steps, m[1], base + m.index, sentence);
    }
    // "<someone> has a brother, [PERSON_2]"
    const hasRe = new RegExp(String.raw`\b(?:has|had)\s+(?:a|an|one|another)\s+(brother|sister|son|daughter)\b,?\s*(${TOKEN})?`, 'gi');
    for (const m of sentence.matchAll(hasRe)) {
      const subject = b.lastBefore(base + m.index, base);
      if (!subject) continue;
      const step = STEP_WORDS[m[1].toLowerCase()];
      const steps = subject.key.split('@')[0].split('>') as Step[];
      if (subject.key.includes('>') || STEP_WORDS[steps[0]]) b.chain([...steps, step], m[2] ?? null, base + m.index + 1, sentence);
    }
    // "[PERSON_3] is [PERSON_2]'s son"
    const ofRe = new RegExp(String.raw`(${TOKEN})\s+(?:is|was)\s+(${TOKEN})(?:'s|’s)\s+(son|daughter|child)\b`, 'gi');
    for (const m of sentence.matchAll(ofRe)) {
      const child = b.found.mentions.find((x) => x.token === m[1]);
      const parent = b.found.mentions.find((x) => x.token === m[2]);
      if (child && parent) b.link(parent.temp, child.temp);
      else b.found.links.push({ from: m[2], to: m[1], type: 'parent_of', consanguineous: false });
    }
    // "He is the son of my father's sister" / "[PERSON_1] is the daughter of my uncle"
    const sonOfRe = new RegExp(String.raw`\b(he|she|${TOKEN})\s+(?:is|was)\s+the\s+(?:son|daughter|child)\s+of\s+my\s+((?:(?:${STEP_RE})(?:'s|’s)\s+)*(?:${STEP_RE}))\b`, 'gi');
    for (const m of sentence.matchAll(sonOfRe)) {
      const child = /^\[PERSON_/.test(m[1]) ? b.found.mentions.find((x) => x.token === m[1]) : b.lastBefore(base + m.index);
      const steps = m[2].toLowerCase().split(/(?:'s|’s)\s+/).map((w) => STEP_WORDS[w.trim()]).filter(Boolean) as Step[];
      const parent = b.chain(steps, null, base + m.index + m[0].length, sentence);
      if (child && parent && child !== parent) b.link(parent.temp, child.temp);
    }
    // "my husband is my cousin"
    const cousinRe = /\bmy\s+(husband|wife|partner)\b[^.]*?\b(?:is|was)\s+(?:also\s+)?my\s+(?:first\s+|second\s+)?(cousin|relative)\b/gi;
    for (const m of sentence.matchAll(cousinRe)) {
      const partner = b.found.mentions.find((x) => x.key === STEP_WORDS[m[1].toLowerCase()]);
      if (partner) b.link('self', partner.temp, 'partner_of', true);
    }
    // Conditions: "who has X", "had X", "is a carrier of X", "is deaf".
    const condRe = /\b(has|had|have|suffers from|suffered from|was diagnosed with|is a carrier of|is a carrier for|was a carrier of|carries)\s+(.+?)(?=,\s*(?:but|and|who|which)\b|[.;!?]|,\s*$|\s+but\s|\s+and\s+(?:my|his|her|\[PERSON)|$)/gi;
    for (const m of sentence.matchAll(condRe)) {
      const words = m[2];
      if (new RegExp(String.raw`^(?:a|an|one|another|two|three)\s+(?:${STEP_RE}|son|daughter|kids|children)\b`, 'i').test(words)) continue;
      if (/^(?:no|any)\b/i.test(words)) continue;
      // "had a genetic test: …" is about a test, not a condition name.
      if (/\b(test|tests|result|results|screening|check-?up|scan)\b/i.test(words)) continue;
      const carrier = /carrier|carries/i.test(m[1]);
      b.condition(b.lastBefore(base + m.index, base) ?? b.lastBefore(base + m.index), words, hedged ? 'not_sure' : carrier ? 'carrier' : 'known');
    }
    for (const m of sentence.matchAll(/\b(?:is|was|are|were)\s+(deaf|hard of hearing)\b/gi)) {
      b.condition(b.lastBefore(base + m.index, base) ?? b.lastBefore(base + m.index), m[1], hedged ? 'not_sure' : 'known');
    }
    // "she is a sickle cell carrier" ("is a carrier" on its own says nothing about which condition).
    for (const m of sentence.matchAll(/\b(?:is|was)\s+an?\s+((?:(?!carrier\b)[\p{L}\d-]+\s+){1,4})carrier\b/giu)) {
      b.condition(b.lastBefore(base + m.index, base) ?? b.lastBefore(base + m.index), m[1], hedged ? 'not_sure' : 'carrier');
    }
  }
}

/* --------------------------------- Arabic --------------------------------- */

type ArKin = { relation: Relation; side: Side; via?: Relation; viaSide?: Side };

const AR_PHRASES: [string, ArKin][] = [
  ['(?:ابن|ولد) (?:عمي|عمّي)', { relation: 'cousin', side: 'paternal', via: 'uncle', viaSide: 'paternal' }],
  ['بنت (?:عمي|عمّي)', { relation: 'cousin', side: 'paternal', via: 'uncle', viaSide: 'paternal' }],
  ['(?:ابن|ولد|بنت) (?:عمتي|عمّتي)', { relation: 'cousin', side: 'paternal', via: 'aunt', viaSide: 'paternal' }],
  ['(?:ابن|ولد|بنت) خالي', { relation: 'cousin', side: 'maternal', via: 'uncle', viaSide: 'maternal' }],
  ['(?:ابن|ولد|بنت) خالتي', { relation: 'cousin', side: 'maternal', via: 'aunt', viaSide: 'maternal' }],
  ['(?:ابن|ولد) (?:أخي|اخي|أخوي|اخوي)', { relation: 'nephew', side: 'none', via: 'brother', viaSide: 'none' }],
  ['(?:ابن|ولد) (?:أختي|اختي)', { relation: 'nephew', side: 'none', via: 'sister', viaSide: 'none' }],
  ['بنت (?:أخي|اخي|أخوي|اخوي)', { relation: 'niece', side: 'none', via: 'brother', viaSide: 'none' }],
  ['بنت (?:أختي|اختي)', { relation: 'niece', side: 'none', via: 'sister', viaSide: 'none' }],
  ['جدتي (?:أم|ام) (?:أمي|امي)', { relation: 'grandmother', side: 'maternal' }],
  ['جدتي (?:أم|ام) (?:أبي|ابي|أبوي|ابوي)', { relation: 'grandmother', side: 'paternal' }],
  ['جدي (?:أبو|ابو) (?:أبي|ابي|أبوي|ابوي)', { relation: 'grandfather', side: 'paternal' }],
  ['جدي (?:أبو|ابو) (?:أمي|امي)', { relation: 'grandfather', side: 'maternal' }],
  ['(?:عمي|عمّي)', { relation: 'uncle', side: 'paternal' }],
  ['(?:عمتي|عمّتي)', { relation: 'aunt', side: 'paternal' }],
  ['خالي', { relation: 'uncle', side: 'maternal' }],
  ['خالتي', { relation: 'aunt', side: 'maternal' }],
  ['جدتي', { relation: 'grandmother', side: 'none' }],
  ['جدي', { relation: 'grandfather', side: 'none' }],
  ['(?:أبي|ابي|أبوي|ابوي|والدي)', { relation: 'father', side: 'none' }],
  ['(?:أمي|امي|والدتي)', { relation: 'mother', side: 'none' }],
  ['(?:أخي|اخي|أخوي|اخوي)', { relation: 'brother', side: 'none' }],
  ['(?:أختي|اختي)', { relation: 'sister', side: 'none' }],
  ['زوجي', { relation: 'husband', side: 'none' }],
  ['زوجتي', { relation: 'wife', side: 'none' }],
  ['(?:ابني|ولدي)', { relation: 'son', side: 'none' }],
  ['(?:بنتي|ابنتي)', { relation: 'daughter', side: 'none' }],
];

function parseArabic(text: string, b: Builder) {
  const alternation = AR_PHRASES.map(([p]) => `(${p})`).join('|');
  const re = new RegExp(String.raw`(?<![\p{L}])[وف]?(?:${alternation})(?![\p{L}])(?:\s+(${TOKEN}))?`, 'gu');
  const sentences = [...text.matchAll(/[^.!?؟\n]+[.!?؟\n]*/gu)];
  for (const s of sentences) {
    const sentence = s[0];
    const base = s.index;
    const hedged = HEDGE.test(sentence);
    let prevEnd = -1;
    let prev: Mention | null = null;
    for (const m of sentence.matchAll(re)) {
      const which = m.slice(1, AR_PHRASES.length + 1).findIndex(Boolean);
      const kin = AR_PHRASES[which][1];
      const token = m[AR_PHRASES.length + 1] ?? null;
      const start = base + m.index;
      // Apposition: "زوجي [PERSON_6] ابن عمي" describes the same person.
      const apposition = prev && kin.via && /^\s*$/u.test(sentence.slice(prevEnd, m.index)) && !token;
      if (apposition && prev && kin.via) {
        const uncles = b.found.mentions.filter((x) => x.relation === kin.via && x.side === kin.viaSide);
        // "زوجي ابن عمي": the uncle is real (he is the reason for the cousin marriage).
        const parent = uncles.length === 1 ? uncles[0] : b.mention(`${kin.via}@${kin.viaSide}`, kin.via, kin.viaSide!, null, start);
        b.link(parent.temp, prev.temp);
        prevEnd = m.index + m[0].length;
        continue;
      }
      let mention: Mention;
      if (kin.via) {
        // "ابن أختي هدى": the name belongs to the sister; the son is unnamed.
        const via = b.found.mentions.filter((x) => x.relation === kin.via && x.side === kin.viaSide && (!token || !x.token || x.token === token));
        const parent = via.length === 1 ? via[0] : b.mention(`${kin.via}@${kin.viaSide}`, kin.via, kin.viaSide!, token, start - 1, !token);
        if (token && !parent.token) parent.token = token;
        mention = b.mention(`${kin.relation}@${kin.side}#${start}`, kin.relation, kin.side, null, start);
        b.link(parent.temp, mention.temp);
      } else {
        // The same word twice refers to the same person ("عمي" … "ابن عمي"), unless named differently.
        const key = `${kin.relation}@${kin.side}`;
        const same = b.found.mentions.find((x) => x.key === key);
        mention = same && (!token || !same.token || same.token === token) ? b.mention(key, kin.relation, kin.side, token, start) : b.mention(`${key}#${start}`, kin.relation, kin.side, token, start);
        if (kin.side === 'none' && SIDED.has(kin.relation)) {
          const side: Side = /جهة\s+(?:الأب|الاب|أبي|ابي|أبوي|ابوي)/u.test(sentence) ? 'paternal' : /جهة\s+(?:الأم|الام|أمي|امي)/u.test(sentence) ? 'maternal' : 'none';
          if (side !== 'none') {
            mention.side = side;
            mention.ambiguous = false;
          }
        }
      }
      prev = mention;
      prevEnd = m.index + m[0].length;
    }

    const known = /(?:عنده|عندها|عندهم|كان عنده|كانت عندها|مصاب ب|مصابة ب|يعاني من|تعاني من|كان يعاني من|كانت تعاني من)\s*(.+?)(?=[،,.؟!]|\s+و(?:زوج|عم|خال|أب|اب|ام|أم|أخ|اخ|جد|بنت|ابن|لكن)|\s+(?:لكن|بس)\s|$)/gu;
    for (const m of sentence.matchAll(known)) {
      b.condition(b.lastBefore(base + m.index, base), m[1], hedged ? 'not_sure' : 'known');
    }
    const carrier = /(?:ناقل|ناقلة|حامل|حاملة)\s+(?:لمرض\s+|للمرض\s+|لل|ل)?(.+?)(?=[،,.؟!]|\s+و|$)/gu;
    for (const m of sentence.matchAll(carrier)) {
      b.condition(b.lastBefore(base + m.index, base), m[1], hedged ? 'not_sure' : 'carrier');
    }
    for (const m of sentence.matchAll(/(?<![\p{L}])(أصم|صماء|لا يسمع|لا تسمع)(?![\p{L}])/gu)) {
      b.condition(b.lastBefore(base + m.index, base), m[1], hedged ? 'not_sure' : 'known');
    }
  }
}

/* --------------------------------- Planner -------------------------------- */

function langOf(text: string, fallback: Lang): Lang {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (arabic === 0 && latin === 0) return fallback;
  return arabic > latin ? 'ar' : 'en';
}

function parse(text: string, forcedSide: Side | 'unsure' | null): Found {
  const b = new Builder(forcedSide);
  parseEnglish(text, b);
  parseArabic(text, b);
  return b.found;
}

function sideFromAnswer(answer: string): Side | 'unsure' | null {
  if (/father|dad|paternal|الأب|الاب|أبي|ابي|أبوي|ابوي/i.test(answer)) return 'paternal';
  if (/mother|mum|mom|maternal|الأم|الام|أمي|امي/i.test(answer)) return 'maternal';
  if (/not sure|unsure|don't know|لست متأكد|مش متأكد|لا أعرف|لا اعرف/i.test(answer)) return 'unsure';
  return null;
}

function opsFor(found: Found, only: Set<string> | null, tree: CompactTree, lang: Lang): Op[] {
  const ops: Op[] = [];
  const asked = new Set<string>();
  const keep = (m: Mention) => (only ? only.has(m.key) : true);
  const included = new Set<string>();

  for (const m of found.mentions) {
    if (!keep(m)) continue;
    if (m.implicit) continue;
    if (m.ambiguous) {
      if (asked.size < 2 && !asked.has(m.relation)) {
        asked.add(m.relation);
        const rel = copy[lang].relations[m.relation as keyof typeof enQuestions.relations] ?? m.relation;
        ops.push({ tool: 'ask_user', input: { question: copy[lang].side.replace('{relation}', rel), choices: copy[lang].sideChoices } });
      }
      continue;
    }
    const existing = m.token ? tree.members.find((x) => x.token === m.token) : undefined;
    if (existing) {
      included.add(m.temp);
      continue;
    }
    included.add(m.temp);
    ops.push({
      tool: 'add_person',
      input: { temp_id: m.temp, relation_hint: m.relation, side: m.side, sex: 'unknown', generation: m.relation === 'relative' ? -1 : 0, label_token: m.token },
    });
  }
  const refOf = (x: string) => {
    if (x === 'self' || /^\[PERSON_/.test(x)) {
      if (x === 'self') return 'self';
      const m = found.mentions.find((y) => y.token === x);
      if (m) return included.has(m.temp) ? m.temp : null;
      return tree.members.find((y) => y.token === x)?.id ?? null;
    }
    const m = found.mentions.find((y) => y.temp === x);
    if (!m || !included.has(x)) return null;
    const existing = m.token ? tree.members.find((y) => y.token === m.token) : undefined;
    return existing?.id ?? x;
  };
  for (const l of found.links) {
    const from = refOf(l.from);
    const to = refOf(l.to);
    if (from && to) ops.push({ tool: 'add_link', input: { from, to, type: l.type, consanguineous: l.consanguineous } });
  }
  for (const c of found.conditions) {
    const person = refOf(c.person);
    if (person) ops.push({ tool: 'add_condition', input: { person, condition_query: c.words, status: c.status } });
  }
  return ops;
}

export type RulesInput = {
  text: string;
  locale: Lang;
  kind: 'describe' | 'answer';
  tree: CompactTree;
  history: { role: 'user' | 'assistant'; text: string }[];
};

export function planWithRules(input: RulesInput): Op[] {
  const lang = langOf(input.text, input.locale);

  if (input.kind === 'answer') {
    // Re-read the description the question was about, with the side now known.
    const lastUser = [...input.history].reverse().find((h) => h.role === 'user' && !h.text.startsWith('['));
    const side = sideFromAnswer(input.text);
    if (!lastUser || !side) return [{ tool: 'done', input: { summary: '' } }];
    const before = parse(lastUser.text, null);
    const pending = new Set(before.mentions.filter((m) => m.ambiguous).map((m) => m.key));
    const found = parse(lastUser.text, side);
    // Keys of resolved mentions change with the side; match by start position instead.
    const starts = new Set(before.mentions.filter((m) => pending.has(m.key)).map((m) => m.start));
    const only = new Set(found.mentions.filter((m) => starts.has(m.start)).map((m) => m.key));
    const ops = opsFor(found, only, input.tree, langOf(lastUser.text, input.locale));
    return [...ops, { tool: 'done', input: { summary: '' } }];
  }

  const found = parse(input.text, null);
  if (found.mentions.length === 0) {
    return [
      { tool: 'ask_user', input: { question: copy[lang].noFamily, choices: copy[lang].noFamilyChoices } },
      { tool: 'done', input: { summary: '' } },
    ];
  }
  return [...opsFor(found, null, input.tree, lang), { tool: 'done', input: { summary: '' } }];
}

export function offTopicQuestion(locale: Lang): Op {
  return { tool: 'ask_user', input: { question: copy[locale].offTopic, choices: copy[locale].noFamilyChoices } };
}
