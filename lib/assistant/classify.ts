/**
 * Step 1 of the two-step safety check (task 06, section 2): label every
 * message before any model sees it. Rules first, in both languages. Safety
 * labels (emergency, distress, injection, pregnancy) always come from the
 * rules and can never be overridden by the optional model refinement.
 */
import { findEntries, normalise } from './library';
import type { Category } from './types';

type Rule = { category: Category; patterns: RegExp[] };

const any = (...words: string[]) => new RegExp(words.join('|'), 'iu');

// Order matters: the first matching rule wins.
const rules: Rule[] = [
  {
    category: 'emergency',
    patterns: [
      any(
        "can'?t breathe", 'cannot breathe', 'not breathing', 'chest pain', 'unconscious',
        'passed out', 'heavy bleeding', 'bleeding (a lot|heavily)', 'seizure', 'fitting',
        'overdose', 'call (an )?ambulance', 'medical emergency', 'turning blue',
        'لا (اقدر|استطيع) التنفس', 'لا يتنفس', 'الم في الصدر', 'فقد الوعي', 'فاقد الوعي',
        'نزيف (شديد|حاد)', 'تشنج', 'جرعه زائده', 'اسعاف', 'طوارئ',
      ),
    ],
  },
  {
    category: 'distress',
    patterns: [
      any(
        'hopeless', 'want to die', 'kill myself', 'end my life', 'suicid', "can'?t cope",
        "can'?t go on", 'no point (in )?living', 'falling apart', 'breaking down',
        'afraid (he|she|they) (will|might) (hurt|hit)', 'hits? me', 'violen', 'forcing me',
        'threaten', 'so scared', 'terrified', 'crying (all|every)',
        'يائس', 'اريد ان اموت', 'انتحار', 'انهي حياتي', 'لا اتحمل', 'لم اعد احتمل',
        'يضربني', 'عنف', 'يجبرونني', 'يهددني', 'خائفه جدا', 'خائف جدا', 'منهار', 'منهاره',
      ),
    ],
  },
  {
    category: 'injection',
    patterns: [
      any(
        'ignore (all |your |the |previous |prior )*(instructions|rules|guidelines|prompt)',
        'disregard (your|the|all) (rules|instructions)', 'system prompt', 'your prompt',
        'developer mode', 'jailbreak', 'pretend (you are|to be)', 'act as (a|my) (doctor|physician)',
        'role-?play as', 'you are now (a|my)', 'as a doctor,? tell me', 'reveal your',
        'تجاهل (التعليمات|القواعد|الارشادات)', 'تصرف ك(طبيب|دكتور)', 'تظاهر بانك',
        'اكشف (التعليمات|الاوامر)', 'انت الان طبيب',
      ),
    ],
  },
  {
    category: 'pregnancy',
    patterns: [
      any(
        "i'?m pregnant", 'i am pregnant', 'we are expecting', "we'?re expecting",
        'weeks pregnant', 'months pregnant', '(wife|partner) is pregnant', 'currently pregnant',
        'baby i am carrying', 'during this pregnancy', 'our unborn',
        'انا حامل', 'زوجتي حامل', 'حامل في (الشهر|الاسبوع)', 'اسابيع من الحمل', 'الحمل الحالي',
        'الجنين',
      ),
    ],
  },
  {
    category: 'counselling_prep',
    patterns: [
      any(
        'prepare for (my|our|the) (session|appointment|counsell?ing)',
        'questions (to|i should|should i) ask (the|my|a) counsell?or',
        'summary for (the|my) counsell?or', 'before (my|our) (session|appointment)',
        'after (my|our|the) (session|appointment)', 'the counsell?or (said|told|mentioned)',
        'استعد (للجلسه|للموعد|للاستشاره)', 'اسئله (للمستشار|اسالها المستشار)',
        'ملخص للمستشار', 'قال المستشار', 'قالت المستشاره',
      ),
    ],
  },
  {
    category: 'asked_for_person',
    patterns: [
      any(
        'talk to (a|an|someone|real)', 'speak (to|with) (a|an|someone|real)', 'real person',
        'a human', 'not a (bot|robot)', 'book (a|an) (counsell?or|appointment)',
        'اتحدث مع (شخص|انسان|مستشار)', 'شخص حقيقي', 'احجز (موعد|مستشار)',
      ),
    ],
  },
  {
    category: 'decision_request',
    patterns: [
      any(
        'should (we|i) (still )?(get married|marry|do|have|go|try|cancel|continue|test)',
        'what should (we|i) do', 'is it safe for us to (marry|have)', 'which option',
        'best option', 'help (me|us) (decide|choose|think through)', 'what would you do',
        "(we'?ve|we have|i'?ve|i have) decided", "we'?re going to", 'cancel (the|our) engagement',
        'هل (يجب|ينبغي) ان', 'هل نتزوج', 'ماذا (نفعل|افعل)', 'اي خيار', 'افضل خيار',
        'ساعدني (اقرر|اختار|افكر)', 'قررنا', 'نلغي الخطوبه',
      ),
    ],
  },
  {
    category: 'family',
    patterns: [
      any(
        'family map', 'my (uncle|aunt|cousin|brother|sister|father|mother|dad|mum|mom|grand(father|mother|parents)|relatives|family|siblings)',
        'who (else )?in my family', 'tell my (family|relatives)',
        'خريطه العائله', '(عمي|خالي|عمتي|خالتي|اخي|اختي|ابي|امي|جدي|جدتي|اقاربي|عائلتي)',
        'من في عائلتي',
      ),
    ],
  },
  {
    category: 'personal_result',
    patterns: [
      any(
        'my result', 'our result', 'my report', 'my test', 'am i a carrier', 'my status',
        'for us', 'our (baby|babies|child|children|kids)', 'me and my', 'my (fianc|husband|wife|partner)',
        'نتيجتي', 'نتيجتنا', 'تقريري', 'فحصي', 'هل انا حامل للصفه', '(طفلنا|اطفالنا|اولادنا)',
        'انا و(خطيبي|خطيبتي|زوجي|زوجتي)',
      ),
    ],
  },
  {
    category: 'risk_question',
    patterns: [
      any(
        '(chance|risk|percent|percentage|probability|odds|likely)',
        'both (parents|partners|of us) (are )?carriers', 'two carriers', 'one (parent|partner) (is )?(a )?carrier',
        'احتمال', 'نسبه', 'خطر', 'كلا (الوالدين|الزوجين) (حامل|حاملان)', 'حاملين للصفه',
      ),
    ],
  },
];

const geneticsWords = any(
  'gene', 'genetic', 'dna', 'carrier', 'inherit', 'recessive', 'dominant', 'x-?linked',
  'chromosome', 'screen', 'counsell?(or|ing)', 'thalass', 'sickle', 'mutation', 'variant',
  'جين', 'وراث', 'حامل', 'صفه', 'متنحي', 'سائد', 'كروموسوم', 'فحص', 'استشار', 'ثلاسيميا', 'منجلي',
  // Health questions outside the library still get "I don't know, here's a counsellor".
  'disease', 'disorder', 'syndrome', 'condition', 'illness', 'symptom', 'life expectancy', 'treatment', 'cure',
  'مرض', 'متلازمه', 'اعراض', 'علاج', 'متوسط العمر',
);

const reportLike = any(
  'hba2', 'hbf', 'hbs', 'heterozygous', 'homozygous', 'pathogenic', 'variant of uncertain',
  'interpretation', 'genotype', 'hgvs', 'c\\.\\d', 'p\\.[a-z]{3}', 'zygosity', 'نتيجه الفحص',
);

/** Rule-based label. `hasReport`: the user pasted or uploaded a report this turn. */
export function classifyByRules(message: string, opts: { hasReport?: boolean } = {}): Category {
  const text = normalise(message);
  const raw = message.toLowerCase();
  const matches = (rule: Rule) => rule.patterns.some((p) => p.test(text) || p.test(raw));

  // Safety first, whatever else the message contains.
  for (const rule of rules.slice(0, 4)) if (matches(rule)) return rule.category;

  if (opts.hasReport || (reportLike.test(raw) && raw.split('\n').length >= 3)) return 'report';

  for (const rule of rules.slice(4)) if (matches(rule)) return rule.category;

  if (findEntries(message, 'en', 1).length > 0 || geneticsWords.test(text) || geneticsWords.test(raw)) {
    return 'general';
  }
  return 'off_topic';
}

/** Categories the optional model step may never change. */
export const lockedCategories: ReadonlySet<Category> = new Set([
  'emergency',
  'distress',
  'injection',
  'pregnancy',
  'report',
]);
