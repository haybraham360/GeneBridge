'use client';
/**
 * Family map dialogs: add a relative, edit a person, share with my
 * counsellor, and choose relatives to notify (task 08). Rebuilt on the
 * family_members model (task 13); wording unchanged.
 */
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { manualRelations, type ConditionInput, type ManualRelation } from '@/lib/family/manual';
import type { Member, MemberCondition } from '@/lib/family/types';
import { markerClass, type CatalogueItem, type Marker } from './display';

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text';
export const inputClass = cn(
  'min-h-11 w-full rounded-input border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted',
  focusRing,
);

/* --------------------------------- Shared --------------------------------- */

export function Checkbox({
  checked,
  onChange,
  children,
  className = '',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="mt-px grid size-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-ink bg-surface text-white transition peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-text [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="min-w-0 text-[13px] leading-snug">{children}</span>
    </label>
  );
}

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const t = useTranslations('dashboard.family');

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = (): HTMLElement[] =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]'))
        : [];
    (panel?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-card bg-surface shadow-[0_20px_60px_rgba(60,25,5,0.25)]"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 id={titleId} className="text-lg font-extrabold tracking-[-0.02em]">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className={cn('grid size-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-brand-tint-soft', focusRing)}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-wrap justify-end gap-2.5 border-t border-line px-6 py-4">{footer}</div>
      </div>
    </div>
  );
}

/* ---------------------------- Condition picker ---------------------------- */

type PickerStatus = 'condition' | 'carrier' | 'unsure' | 'none';
const pickerOrder: PickerStatus[] = ['condition', 'carrier', 'unsure', 'none'];
const pickerMarker: Record<PickerStatus, Marker> = { condition: 'known', carrier: 'carrier', unsure: 'not_sure', none: 'none' };

function toPicker(c: MemberCondition | undefined): { status: PickerStatus; conditionId: string; otherText: string } {
  if (!c) return { status: 'none', conditionId: '', otherText: '' };
  return {
    status: c.status === 'known' ? 'condition' : c.status === 'carrier' ? 'carrier' : 'unsure',
    conditionId: c.conditionId ?? 'other',
    otherText: c.otherText ?? '',
  };
}

export function fromPicker(v: { status: PickerStatus; conditionId: string; otherText: string }): ConditionInput {
  if (v.status === 'none') return null;
  const status = v.status === 'condition' ? 'known' : v.status === 'carrier' ? 'carrier' : 'not_sure';
  if (v.conditionId && v.conditionId !== 'other') return { conditionId: v.conditionId, otherText: null, status };
  return { conditionId: null, otherText: v.otherText.trim() || null, status };
}

function ConditionPicker({
  value,
  onChange,
  catalogue,
}: {
  value: ReturnType<typeof toPicker>;
  onChange: (next: ReturnType<typeof toPicker>) => void;
  catalogue: CatalogueItem[];
}) {
  const t = useTranslations('dashboard.family');
  const tf = useTranslations('family.condition');
  const id = useId();
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1.5 text-xs font-bold">{t('status.legend')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {pickerOrder.map((s) => (
            <label
              key={s}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-input border border-line-strong bg-surface px-3 py-2 text-xs font-semibold transition has-checked:border-ink has-checked:bg-brand-tint-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-text"
            >
              <input type="radio" name={`${id}-status`} className="sr-only" checked={value.status === s} onChange={() => onChange({ ...value, status: s })} />
              <span aria-hidden className={cn('size-3 shrink-0 rounded-[3px] border', markerClass[pickerMarker[s]])} />
              {t(`status.option.${s}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {value.status !== 'none' ? (
        <div className="space-y-2">
          <label htmlFor={`${id}-cond`} className="block text-xs font-bold">
            {tf('pick')}
          </label>
          <select
            id={`${id}-cond`}
            className={inputClass}
            value={value.conditionId || 'other'}
            onChange={(e) => onChange({ ...value, conditionId: e.target.value })}
          >
            {catalogue.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
            <option value="other">{tf('otherOption')}</option>
          </select>
          {(value.conditionId || 'other') === 'other' ? (
            <>
              <label htmlFor={`${id}-other`} className="sr-only">
                {tf('otherLabel')}
              </label>
              <input
                id={`${id}-other`}
                dir="auto"
                className={inputClass}
                maxLength={120}
                placeholder={tf('otherLabel')}
                value={value.otherText}
                onChange={(e) => onChange({ ...value, otherText: e.target.value })}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ Add a relative ----------------------------- */

export type AddRelativeInput = {
  label: string;
  relation: ManualRelation;
  targetId: string;
  consanguineous: boolean;
  condition: ConditionInput;
};

export function AddRelativeDialog({
  people,
  defaultTargetId,
  catalogue,
  error,
  onAdd,
  onClose,
}: {
  people: { id: string; name: string }[];
  defaultTargetId: string;
  catalogue: CatalogueItem[];
  error: string | null;
  onAdd: (input: AddRelativeInput) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const t = useTranslations('dashboard.family');
  const [label, setLabel] = useState('');
  const [relation, setRelation] = useState<ManualRelation>('sibling');
  const [targetId, setTargetId] = useState(defaultTargetId);
  const [consanguineous, setConsanguineous] = useState(false);
  const [condition, setCondition] = useState(() => ({ ...toPicker(undefined), status: 'unsure' as PickerStatus }));
  const isPartner = relation === 'husband' || relation === 'wife' || relation === 'partner';
  const canSubmit = label.trim().length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onAdd({ label, relation, targetId, consanguineous: isPartner && consanguineous, condition: fromPicker(condition) });
  };

  return (
    <Modal
      title={t('add.title')}
      description={t('add.description')}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClasses('ghost', 'sm')}>
            {t('common.cancel')}
          </button>
          <button type="submit" form={formId} disabled={!canSubmit} className={buttonClasses('primary', 'sm', 'disabled:cursor-not-allowed disabled:opacity-50')}>
            {t('add.submit')}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={`${formId}-name`} className="mb-1.5 block text-xs font-bold">
            {t('add.name')}
          </label>
          <input
            id={`${formId}-name`}
            data-autofocus
            dir="auto"
            className={inputClass}
            value={label}
            maxLength={40}
            placeholder={t('add.namePlaceholder')}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${formId}-rel`} className="mb-1.5 block text-xs font-bold">
              {t('add.relation')}
            </label>
            <select id={`${formId}-rel`} className={inputClass} value={relation} onChange={(e) => setRelation(e.target.value as ManualRelation)}>
              {manualRelations.map((r) => (
                <option key={r} value={r}>
                  {t(`relations.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-target`} className="mb-1.5 block text-xs font-bold">
              {t('add.of')}
            </label>
            <select id={`${formId}-target`} className={inputClass} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {isPartner ? (
          <Checkbox checked={consanguineous} onChange={setConsanguineous}>
            {t('add.cousins')}
          </Checkbox>
        ) : null}
        <ConditionPicker value={condition} onChange={setCondition} catalogue={catalogue} />
        {error ? (
          <p role="alert" className="rounded-input bg-brand-tint-soft px-3 py-2.5 text-xs leading-relaxed text-brand-text-dark">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/* ------------------------------- Edit a person ----------------------------- */

export function EditPersonDialog({
  member,
  name,
  condition: initial,
  catalogue,
  canRemove,
  onSave,
  onRemove,
  onClose,
}: {
  member: Member;
  name: string;
  condition: MemberCondition | undefined;
  catalogue: CatalogueItem[];
  canRemove: boolean;
  onSave: (patch: { label: string; condition: ConditionInput }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const formId = useId();
  const t = useTranslations('dashboard.family');
  const [label, setLabel] = useState(member.label ?? '');
  const [condition, setCondition] = useState(() => toPicker(initial));
  const [confirmRemove, setConfirmRemove] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ label, condition: fromPicker(condition) });
  };

  return (
    <Modal
      title={t('edit.title', { name })}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClasses('ghost', 'sm')}>
            {t('common.cancel')}
          </button>
          <button type="submit" form={formId} className={buttonClasses('primary', 'sm')}>
            {t('edit.save')}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        {!member.isOwner ? (
          <div>
            <label htmlFor={`${formId}-name`} className="mb-1.5 block text-xs font-bold">
              {t('edit.name')}
            </label>
            <input id={`${formId}-name`} data-autofocus dir="auto" className={inputClass} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          </div>
        ) : null}
        <ConditionPicker value={condition} onChange={setCondition} catalogue={catalogue} />
        {canRemove ? (
          <div className="border-t border-line pt-4">
            {confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="me-auto text-xs text-muted">{t('edit.confirm', { name })}</p>
                <button type="button" onClick={() => setConfirmRemove(false)} className={buttonClasses('ghost', 'sm')}>
                  {t('edit.keep')}
                </button>
                <button type="button" onClick={onRemove} className={buttonClasses('dark', 'sm')}>
                  {t('edit.remove')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className={cn('min-h-11 text-xs font-bold text-affected underline underline-offset-2', focusRing)}
              >
                {t('edit.removeCta')}
              </button>
            )}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

/* --------------------------- Share with counsellor -------------------------- */

export function ShareDialog({
  shared,
  peopleCount,
  flaggedCount,
  onShare,
  onStop,
  onClose,
}: {
  shared: boolean;
  peopleCount: number;
  flaggedCount: number;
  onShare: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const [understood, setUnderstood] = useState(false);
  const t = useTranslations('dashboard.family');
  return (
    <Modal
      title={shared ? t('share.titleOn') : t('share.titleOff')}
      description={shared ? t('share.descOn') : t('share.descOff')}
      onClose={onClose}
      footer={
        shared ? (
          <>
            <button type="button" onClick={onStop} className={buttonClasses('ghost', 'sm')}>
              {t('share.stop')}
            </button>
            <button type="button" onClick={onClose} className={buttonClasses('dark', 'sm')}>
              {t('share.done')}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className={buttonClasses('ghost', 'sm')}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={onShare} disabled={!understood} className={buttonClasses('primary', 'sm', 'disabled:cursor-not-allowed disabled:opacity-50')}>
              {t('share.confirm')}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <p className="rounded-input bg-brand-tint-soft px-3 py-2.5 text-xs leading-relaxed text-muted">
          {t('share.summary', { people: peopleCount, flagged: flaggedCount })}
        </p>
        {!shared ? (
          <Checkbox checked={understood} onChange={setUnderstood}>
            <span data-autofocus>{t('share.understand')}</span>
          </Checkbox>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---------------------------- Notify relatives ---------------------------- */

export type NotifyPayload = {
  phones: string[];
  channel: 'sms' | 'whatsapp';
  locale: 'ar' | 'en';
  conditionId: string | null;
  anonymous: boolean;
  signedName: string | null;
};

export type NotifyResult =
  | { status: 'sent'; count: number; devLinks: string[] }
  | { status: 'rate_limited'; remaining: number }
  | { status: 'invalid_phone'; index: number }
  | { status: 'duplicate_phone'; index: number }
  | { status: 'name_required' }
  | { status: 'error' };


export function NotifyDialog({
  relatives,
  conditions,
  anonymous,
  onAnonymousChange,
  defaultLocale,
  onSend,
  onClose,
}: {
  relatives: { id: string; name: string; marker: Marker }[];
  /** The condition catalogue (content/library), sorted by title. */
  conditions: { id: string; title: string }[];
  anonymous: boolean;
  onAnonymousChange: (next: boolean) => void;
  defaultLocale: 'ar' | 'en';
  /** Names and map ids never leave the browser: only phones and options are sent. */
  onSend: (payload: NotifyPayload) => Promise<NotifyResult>;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('whatsapp');
  const [locale, setLocale] = useState<'ar' | 'en'>(defaultLocale);
  const [includeCondition, setIncludeCondition] = useState(false);
  const [conditionId, setConditionId] = useState<string>(conditions[0]?.id ?? '');
  const [signedName, setSignedName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('dashboard.family');
  const tNotice = useTranslations('notice.conditions');
  // Hand-worded notice names win; other catalogue conditions use their title.
  const loose = tNotice as unknown as { (key: string): string; has: (key: string) => boolean };
  const noticeName = (id: string, title: string) => (loose.has(`${id}.name`) ? loose(`${id}.name`) : title);
  const ids = useId();

  const chosen = relatives.filter((r) => picked.includes(r.id));
  const nameOf = (index: number) => chosen[index]?.name ?? '';
  const toggle = (id: string, next: boolean) => setPicked((prev) => (next ? [...prev, id] : prev.filter((p) => p !== id)));

  const previewParams = new URLSearchParams({
    anonymous: anonymous ? '1' : '0',
    ...(includeCondition ? { condition: conditionId } : {}),
    ...(!anonymous && signedName.trim() ? { name: signedName.trim() } : {}),
  });
  const previewHref = `/${locale}/family-notice/preview?${previewParams}`;

  const send = async () => {
    if (!chosen.length || sending) return;
    const missing = chosen.findIndex((r) => !(phones[r.id] ?? '').trim());
    if (missing !== -1) {
      setError(t('notify.errors.phoneRequired', { name: nameOf(missing) }));
      document.getElementById(`${ids}-phone-${chosen[missing].id}`)?.focus();
      return;
    }
    if (!anonymous && !signedName.trim()) {
      setError(t('notify.errors.nameRequired'));
      document.getElementById(`${ids}-signed`)?.focus();
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await onSend({
        phones: chosen.map((r) => phones[r.id] ?? ''),
        channel,
        locale,
        conditionId: includeCondition ? conditionId : null,
        anonymous,
        signedName: anonymous ? null : signedName.trim(),
      });
      if (result.status === 'sent') return;
      setSending(false);
      if (result.status === 'rate_limited') setError(t('notify.errors.rateLimited', { remaining: result.remaining }));
      else if (result.status === 'invalid_phone' || result.status === 'duplicate_phone') {
        setError(t(result.status === 'invalid_phone' ? 'notify.errors.invalidPhone' : 'notify.errors.duplicatePhone', { name: nameOf(result.index) }));
        document.getElementById(`${ids}-phone-${chosen[result.index]?.id}`)?.focus();
      } else if (result.status === 'name_required') setError(t('notify.errors.nameRequired'));
      else setError(t('notify.error'));
    } catch {
      setError(t('notify.error'));
      setSending(false);
    }
  };

  const radio = (on: boolean) =>
    cn(
      'flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-full border px-4 text-xs font-bold transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-text',
      on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-brand-tint-soft',
    );

  return (
    <Modal
      title={t('notify.title')}
      description={anonymous ? t('notify.descAnon') : t('notify.descNamed')}
      onClose={onClose}
      footer={
        <>
          <a href={previewHref} target="_blank" rel="noopener" className={buttonClasses('ghost', 'sm', 'me-auto')}>
            {t('notify.preview')}
          </a>
          <button type="button" onClick={onClose} className={buttonClasses('ghost', 'sm')}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={send} disabled={!picked.length || sending} className={buttonClasses('primary', 'sm', 'disabled:cursor-not-allowed disabled:opacity-50')}>
            {sending ? t('notify.sending') : picked.length ? t('notify.send', { count: picked.length }) : t('notify.sendNone')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <blockquote className="rounded-input bg-brand-tint-soft px-3 py-2.5 text-xs leading-relaxed text-muted">
          {t('common.quote', { text: t('notifyMessage') })}
        </blockquote>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold">{t('notify.relatives')}</p>
          <div className="flex gap-3 text-xs font-bold">
            <button type="button" onClick={() => setPicked(relatives.map((r) => r.id))} className={cn('underline underline-offset-2', focusRing)}>
              {t('notify.selectAll')}
            </button>
            <button type="button" onClick={() => setPicked([])} className={cn('underline underline-offset-2', focusRing)}>
              {t('notify.clear')}
            </button>
          </div>
        </div>
        {relatives.length === 0 ? (
          <p className="text-xs text-muted">{t('notify.empty')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-tile border border-line">
            {relatives.map((r, i) => {
              const on = picked.includes(r.id);
              return (
                <li key={r.id} className="space-y-2 px-4 py-3">
                  <Checkbox checked={on} onChange={(next) => toggle(r.id, next)}>
                    <span {...(i === 0 ? { 'data-autofocus': true } : {})} className="flex items-center gap-2">
                      <span aria-hidden className={cn('size-3 shrink-0 rounded-[3px] border', markerClass[r.marker])} />
                      <span className="font-semibold" dir="auto">
                        {r.name}
                      </span>
                    </span>
                  </Checkbox>
                  {on ? (
                    <div className="ps-6">
                      <label htmlFor={`${ids}-phone-${r.id}`} className="sr-only">
                        {t('notify.phoneLabel', { name: r.name })}
                      </label>
                      <input
                        id={`${ids}-phone-${r.id}`}
                        type="tel"
                        inputMode="tel"
                        autoComplete="off"
                        dir="ltr"
                        value={phones[r.id] ?? ''}
                        onChange={(e) => setPhones((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder={t('notify.phonePlaceholder')}
                        className={cn(inputClass, 'text-start')}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {picked.length ? <p className="text-[11px] text-muted">{t('notify.phoneHint')}</p> : null}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-bold">{t('notify.channel')}</legend>
          <div className="flex gap-2">
            {(['whatsapp', 'sms'] as const).map((value) => (
              <label key={value} className={radio(channel === value)}>
                <input type="radio" name={`${ids}-channel`} value={value} checked={channel === value} onChange={() => setChannel(value)} className="sr-only" />
                {t(`notify.channels.${value}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-bold">{t('notify.language')}</legend>
          <div className="flex gap-2">
            {(['ar', 'en'] as const).map((value) => (
              <label key={value} lang={value} className={radio(locale === value)}>
                <input type="radio" name={`${ids}-locale`} value={value} checked={locale === value} onChange={() => setLocale(value)} className="sr-only" />
                {value === 'ar' ? 'العربية' : 'English'}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Checkbox checked={includeCondition} onChange={setIncludeCondition}>
            <span className="font-semibold">{t('notify.includeCondition')}</span>
            <span className="block text-[11px] text-muted">{t('notify.includeConditionHint')}</span>
          </Checkbox>
          {includeCondition ? (
            <div className="ps-6">
              <label htmlFor={`${ids}-condition`} className="sr-only">
                {t('notify.conditionLabel')}
              </label>
              <select id={`${ids}-condition`} value={conditionId} onChange={(e) => setConditionId(e.target.value)} className={inputClass}>
                {conditions.map(({ id, title }) => (
                  <option key={id} value={id}>
                    {noticeName(id, title)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <Checkbox checked={anonymous} onChange={onAnonymousChange}>
            <span className="font-semibold">{t('tell.anonymous')}</span>
          </Checkbox>
          {!anonymous ? (
            <div className="ps-6">
              <label htmlFor={`${ids}-signed`} className="mb-1 block text-xs font-bold">
                {t('notify.signedName')}
              </label>
              <input
                id={`${ids}-signed`}
                type="text"
                maxLength={40}
                autoComplete="given-name"
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-muted">{t('notify.signedHint')}</p>
            </div>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-brand-text-dark">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
