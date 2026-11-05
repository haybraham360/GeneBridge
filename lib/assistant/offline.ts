/**
 * Offline responder: answers from the content library, the inheritance
 * engine and fixed reply templates (content/library/{locale}/assistant),
 * with no AI model. Used when ANTHROPIC_API_KEY is not set, and always for
 * the safety categories (emergency, distress, injection, pregnancy, flagged
 * results), so those replies are fixed and reviewable.
 */
import enReplies from '@/content/library/en/assistant/replies.json';
import arReplies from '@/content/library/ar/assistant/replies.json';
import type { InheritancePattern, InheritanceResult, ParentStatus } from '@/lib/genetics/inheritance';
import { emergencyNumber } from '@/config/support-resources';
import { affectedSides, relativesToConsider } from './family';
import { chip, entryForConditionCode, findCondition, findEntries, getEntry, type LibraryEntry } from './library';
import { analyseReport } from './report';
import { inline } from './text';
import { addEscalation, loadMyResult, runTool, type ToolContext } from './tools';
import type { AssistantLocale, Category, Reply, ReplyAction, RespondInput, TeachbackOffer } from './types';

type Replies = typeof enReplies;
const replies: Record<AssistantLocale, Replies> = { en: enReplies, ar: arReplies as Replies };

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!؟?](\s|$)/u);
  return (m ? m[0] : text).trim();
}

type Draft = {
  paragraphs: string[];
  level: Reply['level'];
  actions: ReplyAction[];
  teachback?: TeachbackOffer;
  prepSummary?: string;
};

function draft(level: Reply['level'], ...paragraphs: string[]): Draft {
  return { paragraphs: paragraphs.filter(Boolean), level, actions: [] };
}

// ---------------------------------------------------------------------------
// Inheritance from words: "both parents are carriers of beta-thalassaemia"
// ---------------------------------------------------------------------------
const said = {
  both: /\b(both|two)\b|كلا|كلاهما|الاثنين|اثنين/iu,
  carrier: /carrier|trait|حامل|حاملان|حاملين|حامله/iu,
  affected: /\baffected\b|\bhas (the )?(disease|condition)|مصاب|مصابه/iu,
  none: /\bnot (a )?carrier|isn'?t (a )?carrier|no changed|non-?carrier|unaffected|ليس حامل|غير حامل|سليم تماما/iu,
  mother: /mother|mom|mum|wife|الام|امي|زوجتي/iu,
  father: /father|dad|husband|الاب|ابي|زوجي/iu,
};

function parentsFromText(text: string, pattern: InheritancePattern): [ParentStatus, ParentStatus] | null {
  if (pattern === 'x_linked') {
    const mother: ParentStatus = said.affected.test(text) && said.mother.test(text) && !said.carrier.test(text)
      ? 'affected'
      : said.carrier.test(text)
        ? 'carrier'
        : 'unaffected';
    const father: ParentStatus = said.father.test(text) && said.affected.test(text) ? 'affected' : 'unaffected';
    return mother === 'unaffected' && father === 'unaffected' ? null : [mother, father];
  }
  if (pattern === 'autosomal_dominant') {
    if (said.affected.test(text)) return said.both.test(text) ? ['affected', 'affected'] : ['affected', 'unaffected'];
    return null;
  }
  const carrier = said.carrier.test(text);
  const affected = said.affected.test(text);
  const none = said.none.test(text);
  if (carrier && affected) return ['affected', 'carrier'];
  if (carrier && none) return ['carrier', 'unaffected'];
  if (affected && none) return ['affected', 'unaffected'];
  if (carrier && said.both.test(text)) return ['carrier', 'carrier'];
  if (affected && said.both.test(text)) return ['affected', 'affected'];
  if (carrier) return /\bone\b|احد/iu.test(text) ? ['carrier', 'unaffected'] : ['carrier', 'carrier'];
  return null;
}

function describeRisk(locale: AssistantLocale, r: InheritanceResult, condition: string): string[] {
  const t = replies[locale].risk;
  const lines: string[] = [];
  if (r.pattern === 'x_linked') {
    lines.push(
      fill(t.intro, {
        p1: t.xl_mother[r.parent1 as keyof typeof t.xl_mother],
        p2: t.xl_father[r.parent2 as keyof typeof t.xl_father],
        condition,
      }),
    );
    const { son, daughter } = r.bySex!;
    lines.push(fill(t.sons, { a: son.affected, u: son.unaffected }));
    lines.push(fill(t.daughters, { a: daughter.affected, c: daughter.carrier, u: daughter.unaffected }));
  } else {
    const intro =
      r.parent1 === r.parent2
        ? fill(t.intro_both, { both: t.both[r.parent1], condition })
        : fill(t.intro, { p1: t.parent[r.parent1], p2: t.parent[r.parent2], condition });
    lines.push(intro);
    const list = [
      fill(t.affected, { n: r.chances.affected, condition }),
      r.pattern === 'autosomal_recessive' ? fill(t.carrier, { n: r.chances.carrier }) : '',
      fill(t.unaffected, { n: r.chances.unaffected }),
    ].filter(Boolean);
    lines.push(list.map((l) => `• ${l}`).join('\n'));
  }
  lines.push(t.same);
  return lines;
}

function genericCondition(locale: AssistantLocale) {
  return locale === 'ar' ? 'الحالة المتنحية' : 'a recessive condition';
}

/** Mentions the user's own family (for X-linked / dominant urgency). */
const ownFamily = /\bmy (family|father|mother|dad|mum|mom|uncle|aunt|brother|sister|cousin|son|daughter|husband|wife)|in our family|عائلتي|ابي|امي|عمي|خالي|اخي|اختي|ابني|ابنتي/iu;

async function riskAnswer(ctx: ToolContext, input: RespondInput, entry: LibraryEntry | null): Promise<Draft> {
  const t = replies[input.locale];
  const pattern = (entry?.inheritance ?? 'autosomal_recessive') as InheritancePattern | 'complex';
  const condition = entry ? inline(entry.title, input.locale) : genericCondition(input.locale);
  if (entry) ctx.sources.set(entry.id, chip(entry));

  if (pattern === 'complex') {
    addEscalation(ctx, 'outside_library', 'standard');
    return draft(2, fill(t.risk.complex, { condition }));
  }
  const parents = parentsFromText(input.message, pattern);
  if (!parents) {
    // "How does cousin marriage affect inherited risk?" is a general question.
    const topics = findEntries(input.message, input.locale);
    return topics.length ? generalAnswer(ctx, input, topics) : draft(1, t.risk.need_details);
  }

  await runTool(ctx, 'calculate_inheritance', { pattern, parent1: parents[0], parent2: parents[1] });
  const result = ctx.engineResults.at(-1)!;
  const d = draft(2, ...describeRisk(input.locale, result, condition));
  if (result.escalate) {
    d.paragraphs.push(fill(t.risk.xl_dom_note, { pattern: t.risk.pattern_names[pattern as 'x_linked'] }));
    addEscalation(ctx, 'x_linked_or_dominant', ownFamily.test(input.message) ? 'priority' : 'standard');
  } else {
    d.teachback = { id: 'same_each_pregnancy', correct: 'yes' };
  }
  return d;
}

function generalAnswer(ctx: ToolContext, input: RespondInput, entries: LibraryEntry[]): Draft {
  const t = replies[input.locale];
  if (entries.length === 0) {
    addEscalation(ctx, 'outside_library', 'standard');
    return draft(3, t.not_in_library);
  }
  const [e] = entries;
  ctx.sources.set(e.id, chip(e));

  if (input.mode === 'simpler') {
    return draft(1, `${t.simpler_prefix} ${firstSentence(e.summary)}`, e.carrier_meaning ? firstSentence(e.carrier_meaning) : '');
  }
  const detail =
    e.kind === 'condition'
      ? [e.inheritance_plain, e.carrier_meaning, input.mode === 'detail' ? e.disease_meaning : '', input.mode === 'detail' ? e.screening : '']
      : [e.body, ...(input.mode === 'detail' && e.options ? e.options.map((o) => `• ${o.name}: ${o.involves}`) : [])];
  const d = draft(
    1,
    e.summary,
    ...(input.mode === 'detail' ? [t.detail_prefix] : []),
    ...detail.filter((x): x is string => Boolean(x)),
    e.kind === 'condition' && e.inheritance === 'autosomal_recessive'
      ? fill(t.general.next_condition, { condition: inline(e.title, input.locale) })
      : t.general.next_general,
  );
  if (e.kind === 'condition' || e.id === 'what_is_a_carrier') d.teachback = { id: 'carrier_healthy', correct: 'yes' };
  return d;
}

async function personalAnswer(ctx: ToolContext, input: RespondInput): Promise<Draft> {
  const t = replies[input.locale];
  const mentioned = findCondition(input.message, input.locale);
  if (!input.useMyResult) {
    const d = generalAnswer(ctx, input, mentioned ? [mentioned] : findEntries('carrier', input.locale, 1));
    d.paragraphs.unshift(t.result.off);
    d.actions.push('turn_on_result');
    return d;
  }
  const summary = await runTool(ctx, 'get_my_result_summary', {});
  const result = ctx.result;
  if (!result) return draft(2, t.result.none);
  if (result.escalate) {
    // Flagged: no explanation, no numbers (guardrail 4).
    return draft(3, t.result.flagged);
  }
  void summary;
  const entry = entryForConditionCode(result.condition, input.locale);
  const condition = entry ? inline(entry.title, input.locale) : result.condition;
  const d = draft(2, fill(t.result[result.status], { condition }));

  if (entry?.inheritance === 'complex') {
    d.paragraphs.push(fill(t.risk.complex, { condition }));
    addEscalation(ctx, 'outside_library', 'standard');
    return d;
  }
  const pattern = (entry?.inheritance ?? 'autosomal_recessive') as InheritancePattern;
  const asParent = (s: 'carrier' | 'affected' | 'no_variant'): ParentStatus => (s === 'no_variant' ? 'unaffected' : s);
  const couple = ctx.couple;
  if (couple) {
    d.paragraphs.push(
      fill(couple.partnerStatus === 'no_variant' ? t.result.couple_one : t.result.couple_both, {
        partner: couple.partnerName,
        condition,
      }),
    );
    await runTool(ctx, 'calculate_inheritance', {
      pattern,
      parent1: asParent(couple.myStatus),
      parent2: asParent(couple.partnerStatus),
    });
  } else if (result.status !== 'no_variant') {
    d.paragraphs.push(t.result.couple_not_shared);
    await runTool(ctx, 'calculate_inheritance', { pattern, parent1: asParent(result.status), parent2: 'carrier' });
  }
  const r = ctx.engineResults.at(-1);
  if (r) {
    d.paragraphs.push(...describeRisk(input.locale, r, condition));
    d.teachback = { id: 'same_each_pregnancy', correct: 'yes' };
    if (r.escalate) addEscalation(ctx, 'x_linked_or_dominant', 'priority');
  }
  return d;
}

const valuePatterns: Record<string, RegExp> = {
  children: /biological|our own child|own children|اطفال بيولوجي|اطفالنا من صلبنا|ننجب/iu,
  faith: /faith|religio|islam|god|allah|sheikh|الدين|ديني|الله|شيخ|فتوى|شرع/iu,
  procedures: /procedure|ivf|needle|surgery|injections|اجراء|ابر|عمليه/iu,
  cost: /cost|money|afford|expensive|price|تكلفه|مال|سعر|غالي/iu,
  family: /family('s)? (views|opinion|think)|parents (think|want)|راي العائله|اهلي|العائله/iu,
};

function decisionAnswer(ctx: ToolContext, input: RespondInput): Draft {
  const t = replies[input.locale];
  if (/(we'?ve|we have|i'?ve|i have) decided|we'?re going to|قررنا|قررت/iu.test(input.message)) {
    addEscalation(ctx, 'major_decision', 'standard');
    const d = draft(3, t.decision.decided);
    d.actions.push('values_exercise');
    return d;
  }
  const options = getEntry('options_overview', input.locale)!;
  ctx.sources.set(options.id, chip(options));
  const lines = options.options!.map(
    (o) => `• ${fill(t.decision.option, { name: o.name, involves: o.involves, timeline: o.timeline, cost: o.cost, question: o.questions[0] })}`,
  );
  const values = Object.entries(valuePatterns)
    .filter(([, p]) => p.test(input.message))
    .map(([k]) => t.decision.value_words[k as keyof typeof t.decision.value_words]);
  const d = draft(
    2,
    ...(values.length ? [fill(t.decision.reflect, { values: values.join(input.locale === 'ar' ? ' و' : ' and ') })] : []),
    t.decision.lead,
    lines.join('\n'),
    t.decision.values,
    t.decision.close,
  );
  d.actions.push('values_exercise', 'book_counsellor');
  return d;
}

function familyAnswer(ctx: ToolContext, input: RespondInput): Draft {
  const t = replies[input.locale].family;
  const family = input.family;
  if (!family) {
    const entry = findCondition(input.message, input.locale);
    const d = entry ? generalAnswer(ctx, input, [entry]) : draft(1);
    d.paragraphs.unshift(t.not_shared);
    return d;
  }
  const entry = getEntry(family.condition, input.locale);
  if (entry) ctx.sources.set(entry.id, chip(entry));
  const sides = affectedSides(family)
    .map((s) => t.sides[s])
    .join(input.locale === 'ar' ? ' و' : ' and ');
  const relatives = relativesToConsider(family).map(
    (m) => t.relations[m.relation as keyof typeof t.relations] ?? m.relation,
  );
  const d = draft(2, fill(t.lead, { condition: entry ? inline(entry.title, input.locale) : family.condition, sides }));
  if (family.pattern === 'autosomal_recessive') {
    d.paragraphs.push(t.pattern_recessive);
  } else {
    d.paragraphs.push(fill(t.pattern_other, { pattern: replies[input.locale].risk.pattern_names[family.pattern] }));
    addEscalation(ctx, 'x_linked_or_dominant', 'priority');
  }
  if (relatives.length) d.paragraphs.push(fill(t.consider, { relatives: relatives.join(input.locale === 'ar' ? '، ' : ', ') }));
  if (family.cousinUnion) d.paragraphs.push(t.cousin);
  d.paragraphs.push(t.offer);
  d.actions.push('draft_family_message');
  return d;
}

async function reportAnswer(ctx: ToolContext, input: RespondInput): Promise<Draft> {
  const t = replies[input.locale].report;
  const stored = input.useMyResult ? await loadMyResult(ctx) : null;
  const analysis = analyseReport(input.reportText || input.message, input.locale, stored);
  if (analysis.stop) {
    addEscalation(ctx, 'flagged_result', 'priority');
    return draft(3, analysis.stopReason === 'differs_from_stored' ? t.stop_differs : t.stop_uncertain);
  }
  const lines = analysis.lines.map((l) =>
    l.text === '[personal details removed]'
      ? ''
      : `• ${l.text}\n  ${l.explanations.length ? l.explanations.join(' ') : t.line_unknown}`,
  );
  for (const id of analysis.lines.flatMap((l) => l.library)) {
    const e = getEntry(id, input.locale);
    if (e) ctx.sources.set(e.id, chip(e));
  }
  const redacted = analysis.lines.some((l) => l.text === '[personal details removed]');
  const d = draft(2, t.lead, lines.filter(Boolean).join('\n'), redacted ? t.redacted : '');
  d.teachback = { id: 'carrier_healthy', correct: 'yes' };
  return d;
}

async function prepAnswer(ctx: ToolContext, input: RespondInput): Promise<Draft> {
  const t = replies[input.locale].prep;
  if (/said|told|mentioned|explained|قال|قالت|ذكر|شرح/iu.test(input.message)) {
    const entries = findEntries(input.message, input.locale, 1);
    if (!entries.length) return draft(1, t.after_unknown);
    const d = generalAnswer(ctx, input, entries);
    d.paragraphs.unshift(t.after);
    return d;
  }
  const questions = [...t.q_general];
  const summaryLines = [t.summary_title];
  if (input.useMyResult) {
    const result = await loadMyResult(ctx);
    if (result && !result.escalate) {
      const entry = entryForConditionCode(result.condition, input.locale);
      if (entry) ctx.sources.set(entry.id, chip(entry));
      const statuses = replies[input.locale].statuses;
      summaryLines.push(fill(t.summary_lines.result, { status: statuses[result.status], condition: entry ? inline(entry.title, input.locale) : result.condition }));
      if (ctx.couple) summaryLines.push(fill(t.summary_lines.partner, { status: statuses[ctx.couple.partnerStatus] }));
    }
  }
  summaryLines.push(t.summary_lines.questions, ...questions.map((q) => `• ${q}`));
  const d = draft(2, t.lead, questions.map((q) => `• ${q}`).join('\n'), t.summary_note);
  d.prepSummary = summaryLines.join('\n');
  d.actions.push('counselling_summary', 'book_counsellor');
  return d;
}

/** Fixed replies for safety categories. Used in every mode. */
export function safetyReply(category: Category, locale: AssistantLocale, ctx: ToolContext): Draft | null {
  const t = replies[locale];
  switch (category) {
    case 'emergency':
      ctx.escalations.push({ kind: 'emergency' });
      return draft(3, fill(t.emergency, { number: emergencyNumber }));
    case 'distress':
      ctx.escalations.push({ kind: 'support' });
      return draft(3, t.distress);
    case 'injection':
      return draft(1, t.injection);
    default:
      return null;
  }
}

export function pregnancyReply(input: RespondInput, ctx: ToolContext): Draft {
  const t = replies[input.locale].pregnancy;
  addEscalation(ctx, 'pregnancy', 'priority');
  const entry = findCondition(input.message, input.locale);
  if (entry) ctx.sources.set(entry.id, chip(entry));
  return draft(3, t.lead, entry ? fill(t.general, { summary: entry.summary }) : '', t.no_numbers);
}

// ---------------------------------------------------------------------------
// "Do I have it?" / "Am I a carrier?" without a result (task 11, exploring
// path). Never confirms, denies or estimates the person's own status: a
// general explanation, then "only a test can tell you", testing and a
// counsellor. Used in both modes, like the pregnancy reply.
// ---------------------------------------------------------------------------
const selfStatus =
  /\b(do i have|have i got|am i (a )?carrier|am i affected|could i (have|be a carrier|be affected|carry)|might i (have|carry)|do i carry|i think i (have|may have|might have)|i might have|i may have)\b|هل انا مصاب|هل أنا مصاب|هل انا حامل|هل أنا حامل|هل احمل|هل أحمل|اظن انني مصاب|أظن أنني مصاب|اظن اني مصاب|أعتقد أنني مصاب|اعتقد انني مصاب|هل يمكن ان اكون حامل|هل يمكن أن أكون حامل/iu;

export function isSelfStatusQuestion(message: string): boolean {
  return selfStatus.test(message);
}

export function selfStatusReply(input: RespondInput, ctx: ToolContext): Draft {
  const t = replies[input.locale].self_status;
  const followedFirst = input.followed?.[0]?.id ? getEntry(input.followed[0].id, input.locale) : null;
  const entry = findCondition(input.message, input.locale) ?? followedFirst;
  if (entry) ctx.sources.set(entry.id, chip(entry));
  const carrier = entry?.carrier_meaning ?? getEntry('what_is_a_carrier', input.locale)?.summary ?? '';
  const pattern = entry?.inheritance;
  // A condition they think they may have that is X-linked or dominant: a
  // priority counsellor request (shown as a card; they choose to send it).
  if (pattern === 'x_linked' || pattern === 'autosomal_dominant') addEscalation(ctx, 'x_linked_or_dominant', 'priority');
  const reply = draft(
    1,
    entry ? fill(t.lead, { condition: entry.title }) : t.lead_general,
    carrier ? fill(t.general, { carrier }) : '',
    t.family,
    t.next,
  );
  reply.actions = ['book_counsellor'];
  return reply;
}

export async function offlineDraft(category: Category, input: RespondInput, ctx: ToolContext): Promise<Draft> {
  const t = replies[input.locale];
  const safety = safetyReply(category, input.locale, ctx);
  if (safety) return safety;
  switch (category) {
    case 'pregnancy':
      return pregnancyReply(input, ctx);
    case 'risk_question':
      return riskAnswer(ctx, input, findCondition(input.message, input.locale));
    case 'personal_result':
      return personalAnswer(ctx, input);
    case 'decision_request':
      return decisionAnswer(ctx, input);
    case 'family':
      return familyAnswer(ctx, input);
    case 'report':
      return reportAnswer(ctx, input);
    case 'counselling_prep':
      return prepAnswer(ctx, input);
    case 'asked_for_person':
      addEscalation(ctx, 'asked_for_person', 'standard');
      return draft(3, t.person);
    case 'off_topic':
      return draft(1, t.off_topic);
    case 'general':
    default:
      return generalAnswer(ctx, input, findEntries(input.message, input.locale));
  }
}

export function draftText(d: Draft): string {
  return d.paragraphs.join('\n\n');
}

export type { Draft };
export { inline };
export function repliesFor(locale: AssistantLocale) {
  return replies[locale];
}
