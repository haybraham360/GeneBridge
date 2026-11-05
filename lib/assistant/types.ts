import type { InheritanceResult } from '@/lib/genetics/inheritance';

export type AssistantLocale = 'en' | 'ar';

/** Classifier labels (task 06, section 2). */
export const categories = [
  'general',
  'risk_question',
  'personal_result',
  'decision_request',
  'pregnancy',
  'distress',
  'emergency',
  'off_topic',
  'injection',
  'report',
  'family',
  'counselling_prep',
  'asked_for_person',
] as const;
export type Category = (typeof categories)[number];

/** 1 educate, 2 personalise and support, 3 escalate. */
export type Level = 1 | 2 | 3;

export type EscalationTrigger =
  | 'flagged_result'
  | 'pregnancy'
  | 'x_linked_or_dominant'
  | 'major_decision'
  | 'outside_library'
  | 'distress'
  | 'asked_for_person';

export type Escalation =
  | { kind: 'counsellor'; trigger: EscalationTrigger; urgency: 'standard' | 'priority' }
  | { kind: 'support' }
  | { kind: 'emergency' };

export type SourceChip = { id: string; title: string };

/** Minimal result summary (get_my_result_summary). Never raw data. */
export type ResultSummary =
  | { escalate: true }
  | { escalate: false; condition: string; status: 'carrier' | 'affected' | 'no_variant' };

export type CoupleSummary = {
  partnerName: string;
  condition: string;
  myStatus: 'carrier' | 'affected' | 'no_variant';
  partnerStatus: 'carrier' | 'affected' | 'no_variant';
};

/** Family map shared into the chat: relations and statuses only, no names. */
export type FamilyMember = {
  relation: string;
  side: 'mother' | 'father' | 'own' | 'partner';
  generation: -1 | 0 | 1;
  status: 'known_condition' | 'carrier' | 'not_sure' | 'none';
};
export type FamilySnapshot = {
  condition: string;
  pattern: 'autosomal_recessive' | 'autosomal_dominant' | 'x_linked';
  members: FamilyMember[];
  cousinUnion: boolean;
};

export type TeachbackOffer = {
  id: 'same_each_pregnancy' | 'carrier_healthy';
  correct: 'yes' | 'no';
};

export type ReplyAction =
  | 'values_exercise'
  | 'book_counsellor'
  | 'draft_family_message'
  | 'turn_on_result'
  | 'counselling_summary';

export type Reply = {
  text: string;
  category: Category;
  level: Level;
  sources: SourceChip[];
  risk?: InheritanceResult;
  escalation?: Escalation;
  teachback?: TeachbackOffer;
  actions: ReplyAction[];
  /** Editable one-page summary (counselling prep). */
  prepSummary?: string;
  /** True when the output check replaced the model's reply. */
  replaced: boolean;
  /** 'offline' (templates) or the model id. */
  engine: string;
};

export type HistoryTurn = { role: 'user' | 'assistant'; content: string };

export type RespondMode = 'normal' | 'simpler' | 'detail';

export type RespondInput = {
  message: string;
  locale: AssistantLocale;
  mode: RespondMode;
  history: HistoryTurn[];
  /** "Use my result in this chat" is on for this session. */
  useMyResult: boolean;
  /** Shared into this chat by an explicit user action, this session only. */
  family?: FamilySnapshot | null;
  reportText?: string | null;
  /**
   * "Use the conditions I'm following" (task 11): condition ids and why the
   * person follows them. Nothing else. Off by default.
   */
  followed?: { id: string; reason: 'family_history' | 'think_i_have' | 'learning' }[] | null;
};

/** Data access the responder may use. Injected so tests and the eval can fake it. */
export type RespondDeps = {
  /** Only called when useMyResult is on. */
  getMyResult: () => Promise<ResultSummary | null>;
  getCouple: () => Promise<CoupleSummary | null>;
};
