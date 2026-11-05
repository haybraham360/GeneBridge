/**
 * Privacy check before a message is copied or sent (task 09 section 4).
 * Flags drafts that share another person's health information: a named
 * person's result ("Khalid is a carrier"), a relative's condition ("my
 * uncle has sickle cell") or a partner's result ("his result", "we're both
 * carriers"). The person's own result ("I'm a carrier") is never flagged.
 *
 * Simple rules, in English and Arabic. The assistant's classifier adds a
 * second check when AI mode is on (app/api/talk/draft). Pure: no imports.
 */

export type RelationKey =
  | 'husband' | 'wife' | 'fiance' | 'fiancee' | 'partner' | 'brother' | 'sister' | 'mother'
  | 'father' | 'uncle' | 'aunt' | 'cousin' | 'son' | 'daughter' | 'grandmother' | 'grandfather'
  | 'nephew' | 'niece';

export type PrivacyFinding =
  | { flagged: false }
  | {
      flagged: true;
      /** Who the message is about: a name, a relationship, or someone unnamed. */
      subject: { kind: 'name'; name: string } | { kind: 'relation'; relation: RelationKey } | { kind: 'someone' };
    };

const NONE: PrivacyFinding = { flagged: false };

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const enRelations: Record<string, RelationKey> = {
  husband: 'husband', wife: 'wife', fiance: 'fiance', 'fiancé': 'fiance', fiancee: 'fiancee', 'fiancée': 'fiancee',
  partner: 'partner', brother: 'brother', sister: 'sister', mother: 'mother', mum: 'mother', mom: 'mother',
  father: 'father', dad: 'father', uncle: 'uncle', aunt: 'aunt', auntie: 'aunt', cousin: 'cousin', son: 'son',
  daughter: 'daughter', grandmother: 'grandmother', grandma: 'grandmother', grandfather: 'grandfather',
  grandpa: 'grandfather', nephew: 'nephew', niece: 'niece',
};
const enRelationWords = Object.keys(enRelations).join('|');

// Health words that make a sentence about someone a health disclosure.
const enHealth =
  "(?:a\\s+)?(?:carrier|carriers|affected|positive|sick|ill|diagnosed|sickle[\\s-]?cell|thalass[a-z]*|the\\s+trait|the\\s+gene|a\\s+gene\\s+change|the\\s+condition|the\\s+disease|cystic\\s+fibrosis|g6pd|sma|pku|hb\\s?a?s{1,2})";
const enIsHealth = `(?:is|was|'s|are|were)\\s+(?:also\\s+|actually\\s+|definitely\\s+)?${enHealth}`;
const enHasHealth = `(?:has|had|carries|carried|tested\\s+positive\\s+for|was\\s+diagnosed\\s+with)\\s+(?:also\\s+)?(?:the\\s+|a\\s+)?(?:sickle|thalass|trait|gene|condition|disease|cystic|g6pd|sma|pku|hbas|hbss|changed)`;
const enResult = `(?:screening\\s+)?(?:result|results|test|tests|report|status|genotype)`;

// Capitalised words that start sentences but aren't names.
const notNames = new Set(
  ('I Im My Your Our Their His Her The This That These Those It Its We You They He She There Here Being Testing ' +
    'A An And But So If When What Who Which Someone Somebody Everyone Nobody Anyone Each Both Most Many Some ' +
    'Carrier Carriers Sickle Thalassemia Thalassaemia Screening Today Tonight Yesterday Tomorrow GeneBridge ' +
    'Monday Tuesday Wednesday Thursday Friday Saturday Sunday Mum Mom Dad Uncle Aunt Auntie Cousin').split(' '),
);

const titles = new Set(['Uncle', 'Aunt', 'Auntie', 'Cousin', 'Grandma', 'Grandpa']);

const enName = "([A-Z][a-z\\u00C0-\\u024F]+(?:\\s[A-Z][a-z\\u00C0-\\u024F]+)?)";

function enCheck(text: string): PrivacyFinding {
  // "my brother is a carrier", "my uncle has sickle cell", "my wife's result"
  const relation = new RegExp(
    `\\bmy\\s+(${enRelationWords})(?:'s\\s+${enResult}|\\s+${enIsHealth}|\\s+${enHasHealth}|\\s+and\\s+i\\s+are\\s+both\\s+carriers)`,
    'iu',
  ).exec(text);
  if (relation) return { flagged: true, subject: { kind: 'relation', relation: enRelations[relation[1].toLowerCase()] } };

  // "Uncle Saeed has sickle cell", "Khalid is a carrier", "Khalid's result"
  const named = new RegExp(
    `(?:\\b(?:uncle|aunt|auntie|cousin)\\s+)?\\b${enName}(?:'s\\s+${enResult}|\\s+${enIsHealth}|\\s+${enHasHealth}|\\s+and\\s+I\\s+are\\s+both\\s+carriers)`,
    'gu',
  );
  for (const match of text.matchAll(named)) {
    // "Uncle Saeed" → "Saeed"
    const words = match[1].split(' ').filter((w) => !titles.has(w));
    const name = words.join(' ');
    if (name && !notNames.has(words[0])) return { flagged: true, subject: { kind: 'name', name } };
  }

  // "he is a carrier", "she has the trait", "his result", "we're both carriers"
  const someone = new RegExp(
    `\\b(?:he|she)\\s+(?:${enIsHealth}|${enHasHealth})|\\b(?:his|her)\\s+${enResult}\\b|\\bwe(?:'re|\\s+are)\\s+both\\s+carriers\\b|\\bboth\\s+of\\s+us\\s+(?:are|carry)\\b|\\bwe\\s+both\\s+(?:carry|are\\s+carriers)\\b`,
    'iu',
  );
  if (someone.test(text)) return { flagged: true, subject: { kind: 'someone' } };
  return NONE;
}

// ---------------------------------------------------------------------------
// Arabic
// ---------------------------------------------------------------------------

const arRelations: Record<string, RelationKey> = {
  'زوجي': 'husband', 'زوجتي': 'wife', 'خطيبي': 'fiance', 'خطيبتي': 'fiancee', 'شريكي': 'partner', 'شريكتي': 'partner',
  'أخي': 'brother', 'اخي': 'brother', 'أختي': 'sister', 'اختي': 'sister', 'أمي': 'mother', 'امي': 'mother',
  'والدتي': 'mother', 'أبي': 'father', 'ابي': 'father', 'والدي': 'father', 'عمي': 'uncle', 'خالي': 'uncle',
  'عمتي': 'aunt', 'خالتي': 'aunt', 'ابن عمي': 'cousin', 'بنت عمي': 'cousin', 'ابنة عمي': 'cousin', 'ابن خالي': 'cousin',
  'بنت خالي': 'cousin', 'ابنة خالي': 'cousin', 'ابني': 'son', 'ابنتي': 'daughter', 'بنتي': 'daughter',
  'جدتي': 'grandmother', 'جدي': 'grandfather',
};
// Longest first, so "ابن عمي" wins over "عمي".
const arRelationWords = Object.keys(arRelations).sort((a, b) => b.length - a.length).join('|');

const L = '\\p{Script=Arabic}';
const before = `(?<![${'\\p{L}'}])`;
const after = `(?![${'\\p{L}'}])`;
// Third-person health words only: "أحمل" (I carry) is the person's own.
const arHealth = `(?:أيضاً\\s+|ايضا\\s+|أيضا\\s+)?(?:حامل|حاملة|حاملٌ|يحمل|مصاب|مصابة|مريض|مريضة|لديه|لديها|عنده|عندها)${after}`;
const arResult = `(?:نتيجة|نتيجه|نتائج)`;

const arNotNames = new Set(
  ('أنا انا أنني انني إنني لأنني كوني كنت لست ليس ليست أي يعني من أن ان الذي التي هو هي نحن أنت انت أنتِ انتي أنتم ' +
    'أنك انك بأنك لأنك أنه انه بأنه لأنه أنها انها بأنها يجعلك يجعلني يجعله تكون يكون أكون نكون كان كانت لن لم ' +
    'شخص أحد احد معظم بعض كل غير لا قد هذا هذه ذلك تلك كلانا الفحص فحصي التحليل الصفة طفل طفلك وأنا وأنت').split(' '),
);

function arCheck(text: string): PrivacyFinding {
  // "أخي حامل للصفة", "عمي مصاب", "نتيجة زوجي"
  const relation = new RegExp(`${before}(${arRelationWords})\\s+${arHealth}|${before}${arResult}\\s+(${arRelationWords})${after}`, 'u').exec(text);
  if (relation) {
    const word = relation[1] ?? relation[2];
    return { flagged: true, subject: { kind: 'relation', relation: arRelations[word] } };
  }

  // "خالد حامل للصفة", "خالد يحمل الصفة", "نتيجة خالد"
  const named = new RegExp(`${before}(${L}{2,})\\s+${arHealth}|${before}${arResult}\\s+(${L}{2,})${after}`, 'gu');
  for (const match of text.matchAll(named)) {
    const name = match[1] ?? match[2];
    if (name && !arNotNames.has(name) && !name.startsWith('ال') && !/^(نتيجت|فحص)/u.test(name)) {
      return { flagged: true, subject: { kind: 'name', name } };
    }
  }

  // "هو حامل", "هي حاملة", "نتيجته", "كلانا نحمل الصفة"
  const someone = new RegExp(
    `${before}(?:هو|هي)\\s+${arHealth}|${before}(?:نتيجته|نتيجتها|نتيجتهم|نتيجتهما)${after}|${before}كلانا\\s+(?:نحمل|حاملان|يحمل)|${before}(?:نحن|نحنا)\\s+الاثنين\\s+(?:نحمل|حاملان)`,
    'u',
  );
  if (someone.test(text)) return { flagged: true, subject: { kind: 'someone' } };
  return NONE;
}

/** Checks a draft in either language (or a mix). */
export function checkDraftPrivacy(text: string): PrivacyFinding {
  if (!text.trim()) return NONE;
  const en = enCheck(text);
  if (en.flagged) return en;
  return arCheck(text);
}
