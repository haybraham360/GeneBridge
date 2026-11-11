'use client';
/**
 * Family History Mapping (/dashboard/family), with "Describe your family"
 * (task 13). The person speaks or types; GeneBridge proposes people, links
 * and conditions, drawn dashed in the tree until the person keeps them.
 *
 * Privacy:
 *   - Names are masked here before anything is sent ([PERSON_1]); the
 *     mapping lives only in this component's memory for the session.
 *   - Only what the person keeps (or edits by hand) is saved, owner-only.
 *   - The family map never shows risk numbers: that stays in the couple
 *     view, the simulator and Ask GeneBridge.
 */
import { ArrowRight, Calendar, Check, Lock, Redo2, Sparkles, Undo2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { toCompact } from '@/lib/family/ai/compact';
import type { Change, DescribeRequest, Question } from '@/lib/family/ai/schema';
import { applyDiff, diffTrees, isEmptyDiff, type TreeDiff } from '@/lib/family/diff';
import { memberMap, partnersOf } from '@/lib/family/graph';
import { addRelative, editMember, removeRelative, type ManualError } from '@/lib/family/manual';
import { maskText, namesInLabel, newNameMap, tokenFor, unmaskText, type NameMap } from '@/lib/family/mask';
import { keepItem, proposalCounts, proposedIds, reviewItems, skipItem } from '@/lib/family/proposal';
import { MAX_DESCRIBE_CHARS, MAX_PEOPLE, type Tree } from '@/lib/family/types';
import { describeTurn, sendFamilyEvent, type DescribeFailure } from './describeClient';
import { DescribePanel } from './DescribePanel';
import { markerClass, markerFor, useFamilyDisplay, type CatalogueItem } from './display';
import {
  AddRelativeDialog,
  EditPersonDialog,
  focusRing,
  NotifyDialog,
  ShareDialog,
  Checkbox,
  type AddRelativeInput,
  type NotifyPayload,
  type NotifyResult,
} from './FamilyDialogs';
import { FamilyGuide, type GuideStep } from './FamilyGuide';
import { FamilyList } from './FamilyList';
import { FamilyTree } from './FamilyTree';
import { QuestionCard, type ShownQuestion } from './QuestionCard';
import { ReviewBar } from './ReviewBar';

export type { NotifyPayload, NotifyResult };

type SaveOutcome = { status: 'saved' } | { status: 'invalid'; problem: string } | { status: 'error' };

export type FamilyMapProps = {
  initialTree: Tree;
  catalogue: CatalogueItem[];
  selfName: string | null;
  onSave: (diff: TreeDiff) => Promise<SaveOutcome>;
  onNotify?: (payload: NotifyPayload) => Promise<NotifyResult>;
  openNotify?: boolean;
};

type Snapshot = { base: Tree; working: Tree };
/** A model question is unmasked once, when it arrives; `values` keeps the masked choices to send back. */
type StoredQuestion = Question & { values?: string[] };
type DialogKind = 'add' | 'edit' | 'share' | 'notify' | null;

const PRIVATE_NOTE_KEY = 'gb_family_private_note';
/** Opens Ask GeneBridge with the map shared; it explains the map straight away. */
const ASK_HREF = '/dashboard/assistant?family=1';

/** Where the eye is pointed next. */
type Attention = 'describe' | 'review' | 'ask' | 'selected' | null;

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Brings an element into view if it isn't already, gently unless motion is reduced. */
function bringIntoView(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const visible = r.top >= 0 && (r.bottom <= window.innerHeight || r.top < window.innerHeight * 0.4);
  if (!visible) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
}
const VIEW_KEY = 'gb_family_view';

const uuid = () => crypto.randomUUID();

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function FamilyMap({ initialTree, catalogue, selfName, onSave, onNotify, openNotify = false }: FamilyMapProps) {
  const t = useTranslations('family');
  const tm = useTranslations('dashboard.family');
  const locale = useLocale() as 'ar' | 'en';
  const rtl = locale === 'ar';
  const selfLabel = selfName ? tm('selfName', { name: selfName }) : tm('selfNoName');
  const display = useFamilyDisplay(catalogue, selfLabel);

  const [base, setBase] = useState<Tree>(initialTree);
  const [working, setWorking] = useState<Tree>(initialTree);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [questions, setQuestions] = useState<StoredQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<number | null>(null);
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [view, setView] = useState<'tree' | 'list'>('tree');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(openNotify ? 'notify' : null);
  const [editId, setEditId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const [shared, setShared] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [devLinks, setDevLinks] = useState<string[]>([]);
  const [showPrivate, setShowPrivate] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [attention, setAttention] = useState<Attention>(null);

  // Names stay in the browser: name ↔ [PERSON_n], and which member carries which token.
  const names = useRef<NameMap>(newNameMap());
  const tokens = useRef<Map<string, string>>(new Map());
  const turns = useRef<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const abort = useRef<AbortController | null>(null);

  const register = useCallback((tree: Tree) => {
    for (const m of tree.members) {
      if (tokens.current.has(m.id)) continue;
      const word = m.isOwner ? selfName : m.label ? namesInLabel(m.label)[0] : null;
      if (word) tokens.current.set(m.id, tokenFor(names.current, word));
    }
  }, [selfName]);

  useEffect(() => {
    register(initialTree);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the page interactive (tests wait for it) and reads a browser-only preference
    setHydrated(true);
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'tree') setView(saved);
    } catch {
      // Storage blocked: the tree view it is.
    }
    // Only once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The ring around "look here" plays a few times, then stops.
  useEffect(() => {
    if (!attention) return;
    const timer = window.setTimeout(() => setAttention(null), 3800);
    return () => window.clearTimeout(timer);
  }, [attention]);

  /** Points the person at the next place to look: scrolls it into view and rings it. */
  const lookAt = useCallback((id: string, ring: Attention) => {
    // After this render, so a card that is just appearing exists.
    window.requestAnimationFrame(() => {
      bringIntoView(id);
      setAttention(ring);
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const proposed = useMemo(() => proposedIds(base, working), [base, working]);
  const counts = useMemo(() => proposalCounts(base, working), [base, working]);
  const pending = proposed.members.size + proposed.links.size + proposed.conditions.size > 0 || !isEmptyDiff(diffTrees(base, working));
  const items = useMemo(() => (reviewing ? reviewItems(base, working) : []), [reviewing, base, working]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- review ends once nothing is left to review
    if (reviewing && items.length === 0) setReviewing(false);
  }, [reviewing, items.length]);

  const byId = memberMap(working);
  const selected = (selectedId && byId.get(selectedId)) || working.members.find((m) => m.isOwner) || null;
  const savedPeople = base.members.filter((m) => !m.isOwner && !m.placeholder);

  /* ------------------------------ Where you are ------------------------------ */

  const step: GuideStep = busy ? 'draw' : pending ? 'check' : savedPeople.length > 0 ? 'understand' : 'describe';
  const lastStep = useRef<GuideStep>(step);
  useEffect(() => {
    const from = lastStep.current;
    lastStep.current = step;
    if (from === step) return;
    // Follow the work: the tree while drawing, the changes to check, then the explanation.
    if (step === 'draw') lookAt('family-tree-card', null);
    else if (step === 'check') lookAt('family-review', 'review');
    else if (step === 'understand') lookAt('family-ask', 'ask');
  }, [step, lookAt]);

  const startDescribing = () => {
    lookAt('family-describe', 'describe');
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('#family-describe textarea')?.focus({ preventScroll: true }), 350);
  };

  const selectPerson = (id: string) => {
    setSelectedId(id);
    // On phones the details card sits below the map: show it.
    if (window.matchMedia('(max-width: 1023px)').matches) lookAt('family-selected', 'selected');
  };

  /* --------------------------------- Saving -------------------------------- */

  const snapshot = (): Snapshot => ({ base, working });
  const remember = () => {
    setPast((p) => [...p.slice(-30), snapshot()]);
    setFuture([]);
  };

  /** Saves the difference between two saved trees; on failure, puts the old state back. */
  const persist = async (from: Tree, to: Tree, revert: Snapshot): Promise<boolean> => {
    const diff = diffTrees(from, to);
    if (isEmptyDiff(diff)) return true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await onSave(diff);
      if (result.status === 'saved') return true;
    } catch {
      // Falls through to the revert.
    } finally {
      setSaving(false);
    }
    setBase(revert.base);
    setWorking(revert.working);
    setSaveError(t('review.saveError'));
    return false;
  };

  /* ------------------------------ Describe turns ----------------------------- */

  const runTurn = async (text: string, input: 'voice' | 'text', kind: DescribeRequest['kind']): Promise<boolean> => {
    if (busy) return false;
    setDescribeError(null);
    if (working.members.length >= MAX_PEOPLE && kind === 'describe') {
      setDescribeError(t('describe.errors.full', { max: MAX_PEOPLE }));
      return false;
    }
    register(working);
    const known = working.members.flatMap((m) => (m.label ? namesInLabel(m.label) : [])).concat(selfName ? [selfName] : []);
    const masked = maskText(text, names.current, known).slice(0, MAX_DESCRIBE_CHARS);
    const before = snapshot();
    const body: DescribeRequest = {
      text: masked,
      locale,
      input,
      kind,
      tree: toCompact(working, tokens.current, proposed.members),
      history: turns.current.slice(-8),
    };
    if (readSession(PRIVATE_NOTE_KEY) !== '1') {
      setShowPrivate(true);
      try {
        sessionStorage.setItem(PRIVATE_NOTE_KEY, '1');
      } catch {
        // Shown once per page instead.
      }
    }

    setBusy(true);
    setPlaced(0);
    setReviewing(false);
    const asked: Question[] = [];
    abort.current?.abort();
    abort.current = new AbortController();

    const apply = (c: Change) => {
      if (c.kind === 'question') {
        asked.push(c.question);
        return;
      }
      if (c.kind === 'member') {
        if (c.token) tokens.current.set(c.member.id, c.token);
        if (!c.member.placeholder) setPlaced((n) => (n ?? 0) + 1);
      }
      setWorking((prev) => {
        const d: TreeDiff = { upsert: { members: [], links: [], conditions: [] }, remove: { members: [], links: [], conditions: [] } };
        if (c.kind === 'member') {
          const old = prev.members.find((m) => m.id === c.member.id);
          const label = c.token ? (names.current.display[c.token] ?? null) : (old?.label ?? null);
          d.upsert.members.push({ ...c.member, label, isOwner: old?.isOwner ?? false, createdBy: old?.createdBy ?? 'ai' });
        } else if (c.kind === 'link') d.upsert.links.push(c.link);
        else if (c.kind === 'condition') {
          const old = prev.conditions.find((x) => x.id === c.condition.id);
          const otherText = c.condition.otherText === '' ? (old?.otherText ?? null) : c.condition.otherText ? unmaskText(c.condition.otherText, names.current) : null;
          d.upsert.conditions.push({ ...c.condition, otherText });
        } else if (c.kind === 'remove') {
          d.remove[`${c.what}s` as 'members' | 'links' | 'conditions'].push(c.id);
        }
        return applyDiff(prev, d);
      });
    };

    const result = await describeTurn(body, { onChange: apply, signal: abort.current.signal });
    setBusy(false);
    setPlaced(null);
    if ('error' in result) {
      setWorking(before.working);
      const code: DescribeFailure = result.error;
      if (code !== 'cancelled') {
        setDescribeError(code === 'too_long' ? t('describe.errors.too_long', { max: MAX_DESCRIBE_CHARS }) : t(`describe.errors.${code === 'invalid' ? 'invalid' : code}`));
      }
      return false;
    }
    setPast((p) => [...p.slice(-30), before]);
    setFuture([]);
    turns.current.push({ role: 'user', text: kind === 'answer' ? `[answer] ${masked}` : masked });
    for (const q of asked) if (q.kind === 'model') turns.current.push({ role: 'assistant', text: q.text });
    const arrived: StoredQuestion[] = asked.map((q) =>
      q.kind === 'model' ? { ...q, text: unmaskText(q.text, names.current), choices: q.choices.map((c) => unmaskText(c, names.current)), values: q.choices } : q,
    );
    setQuestions((prev) => [...prev.filter((q) => q.kind === 'condition_match'), ...arrived].slice(-2));
    if (result.summary.people + result.summary.links + result.summary.conditions === 0 && asked.length === 0) setToast(t('review.nothing'));
    return true;
  };

  /* ------------------------------- Questions ------------------------------- */

  const shownQuestions: ShownQuestion[] = questions.flatMap((q) => {
    if (q.kind === 'model') {
      return [{ id: q.id, text: q.text, choices: q.choices.map((c, i) => ({ label: c, value: q.values?.[i] ?? c })) }];
    }
    const member = byId.get(q.memberId);
    if (!member || !working.conditions.some((c) => c.id === q.conditionRowId)) return [];
    const name = display.name(member);
    const many = q.candidates.length > 1;
    return [
      {
        id: q.id,
        text: many ? t('question.matchMany', { name }) : t('question.match', { name, condition: display.title(q.candidates[0]) }),
        choices: many
          ? [...q.candidates.map((id) => ({ label: display.title(id), value: id })), { label: t('question.notSure'), value: 'not_sure' }]
          : [
              { label: t('question.yes'), value: q.candidates[0] },
              { label: t('question.no'), value: 'no' },
              { label: t('question.notSure'), value: 'not_sure' },
            ],
      },
    ];
  });

  const answer = (questionId: string, value: string) => {
    const q = questions.find((x) => x.id === questionId);
    if (!q) return;
    setQuestions((prev) => prev.filter((x) => x.id !== questionId));
    sendFamilyEvent('family_question_answered', { kind: q.kind });
    if (q.kind === 'condition_match') {
      // Our catalogue suggestion, confirmed (or not) right here: no AI involved.
      if (!q.candidates.includes(value)) return;
      remember();
      setWorking((prev) => ({
        ...prev,
        conditions: prev.conditions.map((c) => (c.id === q.conditionRowId ? { ...c, conditionId: value, otherText: null, status: q.statedStatus } : c)),
      }));
      return;
    }
    void runTurn(value, 'text', 'answer');
  };

  /* --------------------------- Keep, review, undo --------------------------- */

  const keepAll = async () => {
    const revert = snapshot();
    const c = counts;
    remember();
    setBase(working);
    setQuestions([]);
    if (await persist(base, working, revert)) {
      setToast(t('review.kept'));
      sendFamilyEvent('family_changes_kept', { people: c.people, links: c.links, conditions: c.conditions, mode: 'all' });
      if (c.cousins) sendFamilyEvent('family_consanguinity_marked');
    }
  };

  const undoProposals = () => {
    remember();
    sendFamilyEvent('family_changes_undone', { people: counts.people });
    setWorking(base);
    setQuestions([]);
    setReviewing(false);
    setToast(t('review.undone'));
  };

  const current = items[0];
  const itemLabel = (() => {
    if (!current) return '';
    const m = byId.get(current.memberId);
    const name = m ? display.name(m) : '';
    if (current.kind === 'person') return base.members.some((b) => b.id === current.memberId) ? t('review.item.changed', { name }) : t('review.item.person', { name });
    if (current.kind === 'condition') return t('review.item.condition', { name, condition: display.conditionLine(current.diff.upsert.conditions[0]) });
    const l = current.diff.upsert.links[0];
    return t('review.item.link', { a: display.name(byId.get(l.from)!), b: display.name(byId.get(l.to)!) });
  })();

  const keepCurrent = async () => {
    if (!current) return;
    const next = keepItem(base, current);
    if (!next) {
      setSaveError(t('review.needsOthers'));
      return;
    }
    const revert = snapshot();
    remember();
    setBase(next);
    if (await persist(base, next, revert)) {
      const d = current.diff.upsert;
      sendFamilyEvent('family_changes_kept', {
        people: d.members.filter((m) => !m.placeholder).length,
        links: d.links.length,
        conditions: d.conditions.length,
        mode: 'one_by_one',
      });
      if (d.links.some((l) => l.consanguineous)) sendFamilyEvent('family_consanguinity_marked');
    }
  };

  const skipCurrent = () => {
    if (!current) return;
    remember();
    setWorking(skipItem(base, working, current));
  };

  /* ----------------------------- Undo and redo ----------------------------- */

  const undo = async () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    const now = snapshot();
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [...f, now]);
    setBase(prev.base);
    setWorking(prev.working);
    await persist(now.base, prev.base, now);
  };

  const redo = async () => {
    const next = future[future.length - 1];
    if (!next) return;
    const now = snapshot();
    setFuture((f) => f.slice(0, -1));
    setPast((p) => [...p, now]);
    setBase(next.base);
    setWorking(next.working);
    await persist(now.base, next.base, now);
  };

  /* ------------------------------ Manual edits ------------------------------ */

  const manualErrorText = (e: ManualError, name = '') =>
    e === 'twoParents' ? tm('errors.twoParents', { name }) : e === 'twoPartners' ? tm('errors.twoPartners', { name }) : e === 'noTarget' ? tm('errors.noTarget') : tm('errors.branch');

  /** A hand edit applies to the saved tree and the proposals at once, and is saved straight away. */
  const commitManual = async (nextBase: Tree, toastText: string) => {
    const revert = snapshot();
    const diff = diffTrees(base, nextBase);
    remember();
    setBase(nextBase);
    setWorking((w) => applyDiff(w, diff));
    if (await persist(base, nextBase, revert)) setToast(toastText);
  };

  const handleAdd = async (input: AddRelativeInput) => {
    const result = addRelative(base, input, uuid);
    if ('error' in result) {
      setAddError(manualErrorText(result.error, display.name(byId.get(input.targetId) ?? base.members[0])));
      return;
    }
    setAddError(null);
    setDialog(null);
    setSelectedId(result.id);
    await commitManual(result.tree, tm('toast.added', { name: input.label.trim() }));
  };

  const editing = editId ? byId.get(editId) : null;
  const editingIsProposed = editing ? proposed.members.has(editing.id) && !base.members.some((m) => m.id === editing.id) : false;

  const handleEdit = async (patch: { label: string; condition: Parameters<typeof editMember>[2]['condition'] }) => {
    if (!editing) return;
    const p = { label: patch.label, deceased: editing.deceased, condition: patch.condition };
    setDialog(null);
    if (editingIsProposed) {
      // Still a proposal: the edit changes the proposal, nothing is saved yet.
      const result = editMember(working, editing.id, p, uuid);
      if (!('error' in result)) setWorking(result.tree);
      return;
    }
    const result = editMember(base, editing.id, p, uuid);
    if ('error' in result) return setToast(manualErrorText(result.error));
    await commitManual(result.tree, tm('toast.saved'));
  };

  const handleRemove = async () => {
    if (!editing || editing.isOwner) return;
    const name = display.name(editing);
    setDialog(null);
    setSelectedId(null);
    if (editingIsProposed) {
      const r = removeRelative(working, editing.id);
      if (!('error' in r)) setWorking(r.tree);
      return;
    }
    const result = removeRelative(base, editing.id);
    if ('error' in result) return setToast(manualErrorText(result.error));
    await commitManual(result.tree, tm('toast.removed', { name }));
  };

  /* ---------------------------------- Notify --------------------------------- */

  const handleSend = async (payload: NotifyPayload): Promise<NotifyResult> => {
    const result: NotifyResult = onNotify ? await onNotify(payload) : { status: 'sent', count: payload.phones.length, devLinks: [] };
    if (result.status !== 'sent') return result;
    setDialog(null);
    setToast(tm('toast.sent', { count: result.count }));
    if (result.devLinks.length) setDevLinks(result.devLinks);
    return result;
  };

  /* --------------------------------- Render --------------------------------- */

  const generations = new Set(working.members.map((m) => m.generation)).size;
  const flaggedCount = base.members.filter((m) => ['known', 'carrier'].includes(markerFor(base, m.id))).length;
  const relatives = savedPeople.map((m) => ({ id: m.id, name: display.name(m), marker: markerFor(base, m.id) }));
  const selectedRows = selected ? working.conditions.filter((c) => c.memberId === selected.id) : [];
  const chooseView = (v: 'tree' | 'list') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Not remembered; fine.
    }
  };
  const progress = placed === null ? null : placed === 0 ? t('progress.reading') : t('progress.placing', { count: placed });

  return (
    <div className="px-[clamp(16px,3vw,32px)] py-6 text-ink" data-hydrated={hydrated || undefined}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">{tm('header.title')}</h1>
          <p className="mt-1 text-[13px] text-muted">{shared ? tm('header.subtitleShared') : tm('header.subtitlePrivate')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setDialog('share')}>
            {shared ? <Check className="size-4 text-unaffected" aria-hidden /> : <Calendar className="size-4" aria-hidden />}
            {shared ? tm('header.shared') : tm('header.share')}
          </Button>
          <Button size="sm" onClick={() => setDialog('add')}>
            {tm('header.add')}
          </Button>
        </div>
      </header>

      <div className="mt-5 flex items-center gap-3 rounded-tile bg-brand-tint px-4 py-3 text-[13px]">
        <Lock className="size-4 shrink-0 text-brand-text" aria-hidden />
        <p>{tm.rich(shared ? 'banner.shared' : 'banner.private', { b: (c) => <strong>{c}</strong> })}</p>
      </div>

      <FamilyGuide step={step} onDescribe={startDescribing} onCheck={() => lookAt('family-review', 'review')} askHref={ASK_HREF} />

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="lg:col-start-2 lg:row-start-1">
          <DescribePanel busy={busy} progress={progress} error={describeError} showPrivate={showPrivate} highlight={attention === 'describe'} onSubmit={(text, input) => runTurn(text, input, 'describe')} />
        </div>

        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-span-6 lg:row-start-1">
          <section id="family-tree-card" aria-labelledby="family-title" className={cn(cardClasses, 'scroll-mt-24 p-5')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="family-title" className="text-base font-extrabold tracking-[-0.02em]">
                  {tm('tree.title')}
                </h2>
                <p className="text-[11px] text-muted">{tm('tree.counts', { generations, people: working.members.length })}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label={t('tree.history')} className="flex gap-1.5">
                  <button type="button" onClick={undo} disabled={!past.length || saving || busy} aria-label={t('tree.undo')} title={t('tree.undo')} className={cn('grid size-11 place-items-center rounded-full border border-line bg-surface disabled:opacity-40', focusRing)}>
                    <Undo2 className="size-4 rtl:-scale-x-100" aria-hidden />
                  </button>
                  <button type="button" onClick={redo} disabled={!future.length || saving || busy} aria-label={t('tree.redo')} title={t('tree.redo')} className={cn('grid size-11 place-items-center rounded-full border border-line bg-surface disabled:opacity-40', focusRing)}>
                    <Redo2 className="size-4 rtl:-scale-x-100" aria-hidden />
                  </button>
                </div>
                <div role="radiogroup" aria-label={t('tree.views')} className="flex rounded-full border border-line bg-surface p-1">
                  {(['tree', 'list'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={view === v}
                      onClick={() => chooseView(v)}
                      className={cn('min-h-9 rounded-full px-3.5 text-xs font-bold transition', focusRing, view === v ? 'bg-ink text-white' : 'text-ink hover:bg-brand-tint-soft')}
                    >
                      {v === 'tree' ? t('tree.treeView') : t('tree.listView')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4">
              {view === 'tree' ? (
                <FamilyTree
                  tree={working}
                  proposed={proposed}
                  selectedId={selected?.id ?? null}
                  onSelect={selectPerson}
                  display={display}
                  rtl={rtl}
                  drawing={busy ? progress ?? t('progress.reading') : null}
                  onStartDescribing={startDescribing}
                />
              ) : (
                <FamilyList tree={working} proposed={proposed} selectedId={selected?.id ?? null} onSelect={selectPerson} display={display} />
              )}
            </div>
            {pending && !busy ? (
              <ReviewBar
                counts={counts}
                saving={saving}
                error={saveError}
                highlight={attention === 'review'}
                onKeepAll={keepAll}
                onStartReview={() => setReviewing(true)}
                onUndo={undoProposals}
                review={
                  reviewing && current
                    ? {
                        label: itemLabel,
                        index: 0,
                        total: items.length,
                        onKeep: keepCurrent,
                        onSkip: skipCurrent,
                        onEdit: current.kind === 'person' ? () => { setEditId(current.memberId); setDialog('edit'); } : null,
                        onStop: () => setReviewing(false),
                      }
                    : null
                }
              />
            ) : saveError ? (
              <p role="alert" className="mt-3 text-xs text-brand-text-dark">
                {saveError}
              </p>
            ) : null}
          </section>

          <QuestionCard questions={shownQuestions} busy={busy} onAnswer={answer} />

          {!pending && savedPeople.length > 0 ? (
            <div
              id="family-ask"
              className={cn(
                // Tinted card: its own background and border (cn only joins classes).
                'flex scroll-mt-24 flex-wrap items-center gap-4 rounded-card border border-brand-ring bg-brand-tint-soft p-5 shadow-card',
                attention === 'ask' ? 'motion-safe:animate-attention' : 'motion-safe:animate-card-in',
              )}
              data-testid="family-ask"
            >
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-ink">
                <Sparkles className="size-5" />
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-[15px] font-extrabold tracking-[-0.02em]">{t('ask.prompt')}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t('ask.body')}</p>
              </div>
              <Button href={ASK_HREF} size="sm" variant="dark">
                {t('ask.cta')}
                <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>

        <section
          id="family-selected"
          aria-label={tm('selected.aria')}
          aria-live="polite"
          className={cn(cardClasses, 'scroll-mt-24 p-5 lg:col-start-2', attention === 'selected' && 'motion-safe:animate-attention')}
        >
          <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{tm('selected.label')}</p>
          {selected ? (
            <>
              <h2 dir="auto" className="mt-2.5 text-base font-extrabold tracking-[-0.02em]">
                {selected.placeholder ? t('tree.unknown') : display.name(selected)}
              </h2>
              <p className="mt-1 text-xs text-muted">{display.relation(selected)}</p>
              <ul className="mt-2 space-y-1 text-[12px] text-muted">
                {selectedRows.length ? selectedRows.map((c) => <li key={c.id} dir="auto">{display.conditionLine(c)}</li>) : <li>{t('condition.none')}</li>}
                {partnersOf(working, selected.id).map((p) => (
                  <li key={p} dir="auto">
                    {t('list.partnerOf', { names: display.name(byId.get(p)!) })}
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="ghost" className="mt-3.5" onClick={() => { setEditId(selected.id); setDialog('edit'); }}>
                {tm('selected.edit')}
              </Button>
            </>
          ) : (
            <p className="mt-2.5 text-[13px] text-muted">{tm('selected.empty')}</p>
          )}
        </section>

        <section aria-labelledby="tell-title" className={cn(cardClasses, 'p-5 lg:col-start-2')}>
          <h2 id="tell-title" className="text-sm font-extrabold tracking-[-0.02em]">
            {tm('tell.title')}
          </h2>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">{tm('tell.body')}</p>
          <blockquote className="mt-3.5 rounded-input bg-brand-tint-soft px-3.5 py-3 text-[11.5px] leading-relaxed text-muted">
            {tm('common.quote', { text: tm('notifyMessage') })}
          </blockquote>
          <Checkbox checked={anonymous} onChange={setAnonymous} className="mt-4">
            <span className="text-xs font-semibold">{tm('tell.anonymous')}</span>
          </Checkbox>
          <Button size="sm" className="mt-4 w-full" onClick={() => setDialog('notify')}>
            {tm('tell.cta')}
          </Button>
        </section>

        <section aria-labelledby="key-title" className={cn(cardClasses, 'p-5 lg:col-start-2')}>
          <h2 id="key-title" className="text-base font-extrabold tracking-[-0.02em]">
            {tm('key.title')}
          </h2>
          <ul className="mt-3 space-y-2 text-xs">
            {(['known', 'carrier', 'not_sure', 'none'] as const).map((s, i) => (
              <li key={s} className="flex items-center gap-2.5">
                <span aria-hidden className={cn('size-3 rounded-[3px] border', markerClass[s])} />
                {tm(`status.option.${(['condition', 'carrier', 'unsure', 'none'] as const)[i]}`)}
              </li>
            ))}
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="flex w-3 flex-col gap-0.75">
                <span className="h-[1.5px] bg-neutral-line" />
                <span className="h-[1.5px] bg-neutral-line" />
              </span>
              {tm('key.marriage')}
            </li>
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="h-3 w-4 rounded-[3px] border-[1.5px] border-dashed border-brand" />
              {t('tree.proposed')}
            </li>
          </ul>
        </section>
      </div>

      {dialog === 'add' ? (
        <AddRelativeDialog
          people={base.members.map((m) => ({ id: m.id, name: m.placeholder ? `${display.relation(m)} (${t('tree.unknown')})` : display.name(m) }))}
          defaultTargetId={selected && base.members.some((m) => m.id === selected.id) ? selected.id : (base.members.find((m) => m.isOwner)?.id ?? '')}
          catalogue={catalogue}
          error={addError}
          onAdd={handleAdd}
          onClose={() => {
            setDialog(null);
            setAddError(null);
          }}
        />
      ) : null}
      {dialog === 'edit' && editing ? (
        <EditPersonDialog
          member={editing}
          name={display.name(editing)}
          condition={working.conditions.find((c) => c.memberId === editing.id)}
          catalogue={catalogue}
          canRemove={!editing.isOwner}
          onSave={handleEdit}
          onRemove={handleRemove}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'share' ? (
        <ShareDialog
          shared={shared}
          peopleCount={base.members.length}
          flaggedCount={flaggedCount}
          onShare={() => {
            setShared(true);
            setDialog(null);
            setToast(tm('toast.sharedOn'));
          }}
          onStop={() => {
            setShared(false);
            setDialog(null);
            setToast(tm('toast.sharedOff'));
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'notify' ? (
        <NotifyDialog relatives={relatives} conditions={catalogue} anonymous={anonymous} onAnonymousChange={setAnonymous} defaultLocale={locale} onSend={handleSend} onClose={() => setDialog(null)} />
      ) : null}

      {devLinks.length > 0 ? (
        <div role="region" aria-label={tm('notify.devLinks.title')} className="fixed end-4 bottom-20 z-60 max-w-sm space-y-2 rounded-tile bg-surface p-4 text-xs shadow-lg ring-1 ring-line">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">{tm('notify.devLinks.title')}</p>
            <button type="button" onClick={() => setDevLinks([])} aria-label={tm('notify.devLinks.close')} className={cn('grid size-11 place-items-center rounded-full hover:bg-brand-tint-soft', focusRing)}>
              <X className="size-4" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {devLinks.map((link) => (
              <li key={link}>
                <a href={link} target="_blank" rel="noopener noreferrer" dir="ltr" className="break-all text-brand-text underline">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {toast ? (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-60 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
