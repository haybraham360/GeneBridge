"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Calendar, Check, Lock, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type Status = "condition" | "carrier" | "unsure" | "none";
export type Origin = "added" | "self" | "shared";
export type Gender = "male" | "female" | "unspecified";

export interface Person {
  id: string;
  name: string;
  gender: Gender;
  status: Status;
  /** Shown in brackets after the status, e.g. "shared" -> "Carrier (shared)". */
  statusNote?: string;
  origin: Origin;
  /** Generation row. 0 is the oldest row on the map. */
  gen: number;
  /** Left edge of the node, in map units. */
  x: number;
}

export interface Union {
  id: string;
  /** One or two partner ids. A single id means "parent with no partner on the map". */
  partners: string[];
  children: string[];
  /** Draws the double marriage line labelled "cousins". */
  consanguineous?: boolean;
}

export interface FamilyMapData {
  people: Person[];
  unions: Union[];
}

export interface NotifyPayload {
  /** Map ids, used only in the browser. Names never leave the device. */
  relativeIds: string[];
  /** Same order as relativeIds. Hashed after sending, never stored. */
  phones: string[];
  channel: "sms" | "whatsapp";
  locale: "ar" | "en";
  /** Only when "Include the condition name" is ticked. */
  conditionId: string | null;
  anonymous: boolean;
  signedName: string | null;
}

export type NotifyResult =
  | { status: "sent"; count: number; devLinks: string[] }
  | { status: "rate_limited"; remaining: number }
  | { status: "invalid_phone"; index: number }
  | { status: "duplicate_phone"; index: number }
  | { status: "name_required" }
  | { status: "error" };

type AddError =
  | { code: "noTarget" }
  | { code: "twoPartners"; name: string }
  | { code: "twoParents"; name: string }
  | { code: "branch" }
  | { code: "needParent"; name: string };

type Placement = { people: Person[]; x: number } | { error: AddError };
type AddResult = { data: FamilyMapData; id: string } | { error: AddError };

export interface FamilyMapProps {
  initialData?: FamilyMapData;
  lang?: string;
  onChange?: (data: FamilyMapData) => void;
  onShareChange?: (shared: boolean) => void;
  /**
   * Sends the notices (task 08). Gets no map ids or names: those never leave
   * the browser. Without it, sending is simulated.
   */
  onNotify?: (payload: Omit<NotifyPayload, "relativeIds">) => Promise<NotifyResult>;
  /** Open "Choose relatives to notify" straight away (e.g. from /dashboard/talk). */
  openNotify?: boolean;
  /** The signed-in person's first name, from their account (null if not given). */
  selfName?: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Constants & seed data                                                     */
/* -------------------------------------------------------------------------- */

const NODE_W = 115;
const NODE_H = 50;
const PITCH = 130;
const BAR_GAP = 23;
const PAD_X = 14;
const PAD_Y = 7;

// const NOTIFY_MESSAGE =
//   "A genetic condition may run in our family. Free, confidential testing is available through GeneBridge.";

// const STATUS_META: Record<Status, { label: string; box: string }> = {
//   condition: {
//     label: "Sickle cell disease",
//     box: "border-[#9f1239] bg-[#9f1239]",
//   },
//   carrier: { label: "Carrier", box: "border-[#ff5a1f] bg-[#ff5a1f]" },
//   unsure: { label: "Not sure", box: "border-[#e3d9cf] bg-white" },
//   none: { label: "No known condition", box: "border-[#e5ddd5] bg-[#e5ddd5]" },
// };
const STATUS_META: Record<Status, { box: string }> = {
  condition: { box: "border-[#9f1239] bg-[#9f1239]" },
  carrier: { box: "border-[#ff5a1f] bg-[#ff5a1f]" },
  unsure: { box: "border-[#e3d9cf] bg-white" },
  none: { box: "border-[#e5ddd5] bg-[#e5ddd5]" },
};
const STATUS_ORDER: Status[] = ["condition", "carrier", "unsure", "none"];

interface PersonInfo {
  known: boolean;
  origin: Origin;
  relation:
    | null
    | { kind: "parentOf" | "childOf" | "partnerOf"; gender: Gender; names: string[] };
}

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "condition", label: "Known condition" },
  { value: "carrier", label: "Carrier" },
  { value: "unsure", label: "Not sure" },
  { value: "none", label: "No known condition" },
];

type RelationKind = "parent" | "sibling" | "child" | "partner";

interface Relation {
  id: string;
  label: string;
  kind: RelationKind;
  gender: Gender;
}

const RELATIONS: Relation[] = [
  { id: "father", label: "Father", kind: "parent", gender: "male" },
  { id: "mother", label: "Mother", kind: "parent", gender: "female" },
  { id: "parent", label: "Parent", kind: "parent", gender: "unspecified" },
  { id: "brother", label: "Brother", kind: "sibling", gender: "male" },
  { id: "sister", label: "Sister", kind: "sibling", gender: "female" },
  { id: "sibling", label: "Sibling", kind: "sibling", gender: "unspecified" },
  { id: "son", label: "Son", kind: "child", gender: "male" },
  { id: "daughter", label: "Daughter", kind: "child", gender: "female" },
  { id: "child", label: "Child", kind: "child", gender: "unspecified" },
  { id: "husband", label: "Husband", kind: "partner", gender: "male" },
  { id: "wife", label: "Wife", kind: "partner", gender: "female" },
  { id: "partner", label: "Partner", kind: "partner", gender: "unspecified" },
];

export const DEFAULT_DATA: FamilyMapData = {
  people: [
    { id: "rashid", name: "Grandfather Rashid", gender: "male", status: "none", origin: "added", gen: 0, x: 29 },
    { id: "fatima", name: "Grandmother Fatima", gender: "female", status: "unsure", origin: "added", gen: 0, x: 159 },
    { id: "ali", name: "Grandfather Ali", gender: "male", status: "none", origin: "added", gen: 0, x: 319 },
    { id: "noura", name: "Grandmother Noura", gender: "female", status: "unsure", origin: "added", gen: 0, x: 448 },
    { id: "saeed", name: "Uncle Saeed", gender: "male", status: "condition", origin: "added", gen: 1, x: 14 },
    { id: "ahmed", name: "Father Ahmed", gender: "male", status: "carrier", origin: "added", gen: 1, x: 159 },
    { id: "huda", name: "Mother Huda", gender: "female", status: "unsure", origin: "added", gen: 1, x: 384 },
    { id: "khalid", name: "Khalid", gender: "male", status: "carrier", statusNote: "shared", origin: "shared", gen: 2, x: 14 },
    // The signed-in person. Their name is filled in from their account (selfName).
    { id: "self", name: "", gender: "unspecified", status: "carrier", origin: "self", gen: 2, x: 217 },
    { id: "yousef", name: "Brother Yousef", gender: "male", status: "unsure", origin: "added", gen: 2, x: 391 },
  ],
  unions: [
    { id: "u1", partners: ["rashid", "fatima"], children: ["saeed", "ahmed"] },
    { id: "u2", partners: ["ali", "noura"], children: ["huda"] },
    { id: "u3", partners: ["saeed"], children: ["khalid"] },
    { id: "u4", partners: ["ahmed", "huda"], children: ["self", "yousef"] },
    { id: "u5", partners: ["khalid", "self"], children: [], consanguineous: true },
  ],
};

/* -------------------------------------------------------------------------- */
/*  Pure helpers: layout                                                      */
/* -------------------------------------------------------------------------- */

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function genY(gen: number): number {
  if (gen === 0) return 7;
  if (gen === 1) return 159;
  if (gen >= 2) return 295 + 136 * (gen - 2);
  return 7 + 152 * gen;
}

const isPerson = (p: Person | undefined): p is Person => p !== undefined;

function indexPeople(people: Person[]): Map<string, Person> {
  return new Map(people.map((p) => [p.id, p]));
}

function isFree(
  people: Person[],
  unions: Union[],
  gen: number,
  x: number,
  ignore: string[] = [],
): boolean {
  const sameRow = people.filter((p) => p.gen === gen && !ignore.includes(p.id));
  if (sameRow.some((p) => Math.abs(p.x - x) < NODE_W + 7)) return false;

  // Never drop a node onto the marriage line between two partners.
  const map = indexPeople(people);
  for (const u of unions) {
    if (u.partners.length < 2) continue;
    const pair = u.partners
      .map((id) => map.get(id))
      .filter((p): p is Person => p !== undefined && p.gen === gen)
      .sort((a, b) => a.x - b.x);
    if (pair.length === 2 && x > pair[0].x && x < pair[1].x) return false;
  }
  return true;
}

function findFreeX(
  people: Person[],
  unions: Union[],
  gen: number,
  desired: number,
): number {
  for (let step = 0; step < 60; step += 1) {
    const candidates =
      step === 0 ? [desired] : [desired + step * PITCH, desired - step * PITCH];
    for (const c of candidates) {
      if (isFree(people, unions, gen, c)) return c;
    }
  }
  return desired + 60 * PITCH;
}

// type Placement = { people: Person[]; x: number } | { error: string };

/** Finds a spot right next to `anchor`, pushing the row outwards when needed. */
function placePartner(
  people: Person[],
  unions: Union[],
  anchor: Person,
): Placement {
  const map = indexPeople(people);
  const others = unions
    .filter((u) => u.partners.includes(anchor.id))
    .flatMap((u) => u.partners)
    .filter((id) => id !== anchor.id)
    .map((id) => map.get(id))
    .filter(isPerson);

  const hasRight = others.some((p) => p.x > anchor.x);
  const hasLeft = others.some((p) => p.x < anchor.x);
  if (hasRight && hasLeft) {
    // return { error: `${anchor.name} already has two partners on the map.` };
    return { error: { code: "twoPartners", name: anchor.name } };
  }

  const side = hasRight ? -1 : 1;
  const slot = anchor.x + side * PITCH;
  if (isFree(people, unions, anchor.gen, slot)) return { people, x: slot };

  const shifted = people.map((p) => {
    const onThatSide = side === 1 ? p.x > anchor.x : p.x < anchor.x;
    return p.gen === anchor.gen && p.id !== anchor.id && onThatSide
      ? { ...p, x: p.x + side * PITCH }
      : p;
  });
  return { people: shifted, x: slot };
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers: editing the family                                          */
/* -------------------------------------------------------------------------- */

interface NewRelativeInput {
  name: string;
  status: Status;
  relationId: string;
  targetId: string;
  consanguineous: boolean;
}

// type AddResult = { data: FamilyMapData; id: string } | { error: string };

function addRelative(
  data: FamilyMapData,
  input: NewRelativeInput,
  ids: { person: string; union: string },
): AddResult {
  const rel = RELATIONS.find((r) => r.id === input.relationId);
  const target = data.people.find((p) => p.id === input.targetId);
  if (!rel || !target) return { error: { code: "noTarget" } };

  const { people, unions } = data;
  const base = {
    id: ids.person,
    name: input.name.trim(),
    gender: rel.gender,
    status: input.status,
    origin: "added" as Origin,
  };
  const map = indexPeople(people);

  switch (rel.kind) {
    case "partner": {
      const placed = placePartner(people, unions, target);
      if ("error" in placed) return placed;
      const person: Person = { ...base, gen: target.gen, x: placed.x };
      const single = unions.find(
        (u) => u.partners.includes(target.id) && u.partners.length === 1,
      );
      const nextUnions: Union[] = single
        ? unions.map((u) =>
            u.id === single.id
              ? {
                  ...u,
                  partners: [...u.partners, person.id],
                  consanguineous: Boolean(u.consanguineous) || input.consanguineous,
                }
              : u,
          )
        : [
            ...unions,
            {
              id: ids.union,
              partners: [target.id, person.id],
              children: [],
              consanguineous: input.consanguineous,
            },
          ];
      return {
        data: { people: [...placed.people, person], unions: nextUnions },
        id: person.id,
      };
    }

    case "child": {
      const gen = target.gen + 1;
      const own = unions.find((u) => u.partners.includes(target.id));
      let desired = target.x;
      if (own) {
        const kids = own.children.map((id) => map.get(id)).filter(isPerson);
        const parents = own.partners.map((id) => map.get(id)).filter(isPerson);
        desired = kids.length
          ? Math.max(...kids.map((k) => k.x)) + PITCH
          : parents.reduce((sum, p) => sum + p.x, 0) / Math.max(parents.length, 1);
      }
      const person: Person = {
        ...base,
        gen,
        x: findFreeX(people, unions, gen, desired),
      };
      const nextUnions: Union[] = own
        ? unions.map((u) =>
            u.id === own.id ? { ...u, children: [...u.children, person.id] } : u,
          )
        : [
            ...unions,
            { id: ids.union, partners: [target.id], children: [person.id] },
          ];
      return {
        data: { people: [...people, person], unions: nextUnions },
        id: person.id,
      };
    }

    case "parent": {
      const gen = target.gen - 1;
      const parentUnion = unions.find((u) => u.children.includes(target.id));

      if (!parentUnion) {
        const person: Person = {
          ...base,
          gen,
          x: findFreeX(people, unions, gen, target.x),
        };
        return {
          data: {
            people: [...people, person],
            unions: [
              ...unions,
              { id: ids.union, partners: [person.id], children: [target.id] },
            ],
          },
          id: person.id,
        };
      }

      if (parentUnion.partners.length >= 2) {
        // return { error: `${target.name} already has two parents on the map.` };
        return { error: { code: "twoParents", name: target.name } };
      }
      const existingParent = map.get(parentUnion.partners[0]);
      if (!existingParent) return { error: { code: "branch" } };
      const placed = placePartner(people, unions, existingParent);
      if ("error" in placed) return placed;
      const person: Person = { ...base, gen, x: placed.x };
      return {
        data: {
          people: [...placed.people, person],
          unions: unions.map((u) =>
            u.id === parentUnion.id
              ? { ...u, partners: [...u.partners, person.id] }
              : u,
          ),
        },
        id: person.id,
      };
    }

    case "sibling": {
      const parentUnion = unions.find((u) => u.children.includes(target.id));
      if (!parentUnion) {
        // return {
        //   error: `Add a parent of ${target.name} first, so siblings can be connected.`,
        // };
        return { error: { code: "needParent", name: target.name } }; 
      }
      const person: Person = {
        ...base,
        gen: target.gen,
        x: findFreeX(people, unions, target.gen, target.x + PITCH),
      };
      return {
        data: {
          people: [...people, person],
          unions: unions.map((u) =>
            u.id === parentUnion.id
              ? { ...u, children: [...u.children, person.id] }
              : u,
          ),
        },
        id: person.id,
      };
    }
  }
}

function removePerson(data: FamilyMapData, id: string): FamilyMapData {
  const unions = data.unions
    .map((u) => ({
      ...u,
      partners: u.partners.filter((p) => p !== id),
      children: u.children.filter((c) => c !== id),
    }))
    .filter(
      (u) =>
        u.partners.length > 0 && (u.partners.length > 1 || u.children.length > 0),
    );
  return { people: data.people.filter((p) => p.id !== id), unions };
}

// function joinNames(names: string[]): string {
//   if (names.length <= 1) return names[0] ?? "";
//   return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
// }

// function describePerson(
//   person: Person,
//   data: FamilyMapData,
// ): { status: string; relation: string } {
//   const label = STATUS_META[person.status].label;
//   const known = person.status === "condition" || person.status === "carrier";
//   const origin =
//     person.origin === "added"
//       ? "added by you"
//       : person.origin === "self"
//         ? "from your own result"
//         : "shared with you";
//   const status = `${label}${known ? " · known" : ""} · ${origin}.`;

//   const map = indexPeople(data.people);
//   const asPartner = data.unions.filter((u) => u.partners.includes(person.id));
//   const kids = asPartner
//     .flatMap((u) => u.children)
//     .map((id) => map.get(id)?.name)
//     .filter((n): n is string => Boolean(n));
//   const parentUnion = data.unions.find((u) => u.children.includes(person.id));
//   const parents = (parentUnion?.partners ?? [])
//     .map((id) => map.get(id)?.name)
//     .filter((n): n is string => Boolean(n));
//   const partners = asPartner
//     .flatMap((u) => u.partners)
//     .filter((id) => id !== person.id)
//     .map((id) => map.get(id)?.name)
//     .filter((n): n is string => Boolean(n));

//   let relation = "";
//   if (kids.length) {
//     const word =
//       person.gender === "male" ? "Father" : person.gender === "female" ? "Mother" : "Parent";
//     relation = `${word} of ${joinNames(kids)}.`;
//   } else if (parents.length) {
//     const word =
//       person.gender === "male" ? "Son" : person.gender === "female" ? "Daughter" : "Child";
//     relation = `${word} of ${joinNames(parents)}.`;
//   } else if (partners.length) {
//     const word =
//       person.gender === "male" ? "Husband" : person.gender === "female" ? "Wife" : "Partner";
//     relation = `${word} of ${joinNames(partners)}.`;
//   }
//   return { status, relation };
// }
function describePerson(person: Person, data: FamilyMapData): PersonInfo {
  const known = person.status === "condition" || person.status === "carrier";
  const map = indexPeople(data.people);
  const asPartner = data.unions.filter((u) => u.partners.includes(person.id));
  const kids = asPartner
    .flatMap((u) => u.children)
    .map((id) => map.get(id)?.name)
    .filter((n): n is string => Boolean(n));
  const parentUnion = data.unions.find((u) => u.children.includes(person.id));
  const parents = (parentUnion?.partners ?? [])
    .map((id) => map.get(id)?.name)
    .filter((n): n is string => Boolean(n));
  const partners = asPartner
    .flatMap((u) => u.partners)
    .filter((id) => id !== person.id)
    .map((id) => map.get(id)?.name)
    .filter((n): n is string => Boolean(n));


  const relation: PersonInfo["relation"] = kids.length
    ? { kind: "parentOf", gender: person.gender, names: kids }
    : parents.length
      ? { kind: "childOf", gender: person.gender, names: parents }
      : partners.length
        ? { kind: "partnerOf", gender: person.gender, names: partners }
        : null;

  return { known, origin: person.origin, relation };
}

function useStatusLabels() {
  const t = useTranslations("dashboard.family.status");
  return {
    node: {
      condition: t("node.condition"), carrier: t("node.carrier"),
      unsure: t("node.unsure"), none: t("node.none"),
    } as Record<Status, string>,
    option: {
      condition: t("option.condition"), carrier: t("option.carrier"),
      unsure: t("option.unsure"), none: t("option.none"),
    } as Record<Status, string>,
  };
}

function useRelationLabels(): Record<string, string> {
  const t = useTranslations("dashboard.family.relations");
  return {
    father: t("father"), mother: t("mother"), parent: t("parent"),
    brother: t("brother"), sister: t("sister"), sibling: t("sibling"),
    son: t("son"), daughter: t("daughter"), child: t("child"),
    husband: t("husband"), wife: t("wife"), partner: t("partner"),
  };
}

function useAddErrorText() {
  const t = useTranslations("dashboard.family.errors");
  return (e: AddError): string => {
    switch (e.code) {
      case "noTarget": return t("noTarget");
      case "twoPartners": return t("twoPartners", { name: e.name });
      case "twoParents": return t("twoParents", { name: e.name });
      case "branch": return t("branch");
      case "needParent": return t("needParent", { name: e.name });
    }
  };
}

/* -------------------------------------------------------------------------- */
/*  UI primitives                                                             */
/* -------------------------------------------------------------------------- */

const cardClass =
  "rounded-3xl border border-[#f6e9df] bg-white shadow-[0_1px_2px_rgba(120,60,20,0.04),0_8px_28px_rgba(120,60,20,0.05)]";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]";

const inputClass = `h-10 w-full rounded-xl border border-[#ecdccf] bg-white px-3 text-sm text-[#16110d] placeholder:text-[#a4978c] ${focusRing}`;

function Checkbox({
  checked,
  onChange,
  children,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 ${className}`}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="mt-px grid size-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-[#16110d] bg-white text-white transition peer-checked:bg-[#16110d] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#c2410c] [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="min-w-0 text-[13px] leading-snug">{children}</span>
    </label>
  );
}

function StatusPicker({
  value,
  onChange,
  name,
}: {
  value: Status;
  onChange: (next: Status) => void;
  name: string;
}) {
  const t = useTranslations("dashboard.family");
  const labels = useStatusLabels();
  return (
    <fieldset>
      {/* <legend className="mb-1.5 text-xs font-bold">Condition</legend> */}
      <legend className="mb-1.5 text-xs font-bold">{t("status.legend")}</legend>
      <div className="grid grid-cols-2 gap-2">
        {STATUS_ORDER.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#ecdccf] bg-white px-3 py-2.5 text-xs font-semibold transition has-checked:border-[#16110d] has-checked:bg-[#fffaf6] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[#c2410c]"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === value}
              onChange={() => onChange(value)}
            />
            <span
              aria-hidden
              className={`size-3 shrink-0 rounded-[3px] border ${STATUS_META[value].box}`}
            />
            {labels.option[value]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Modal({
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
  const t = useTranslations("dashboard.family")

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = (): HTMLElement[] =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]',
            ),
          )
        : [];

    const initial =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0];
    initial?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
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

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#16110d]/40 p-4"
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
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-3xl bg-white shadow-[0_20px_60px_rgba(60,25,5,0.25)]"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-[#16110d]">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-[#6b6159]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            // aria-label="Close"
            aria-label={t("common.close")}
            className={`rounded-full p-1.5 text-[#6b6159] transition hover:bg-[#fff4ec] ${focusRing}`}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-wrap justify-end gap-2.5 border-t border-[#f6e9df] px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

const primaryBtn = `rounded-full bg-[#ff5a1f] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#ea4c12] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const darkBtn = `rounded-full bg-[#16110d] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#2c2420] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const outlineBtn = `rounded-full border border-[#f0e2d8] bg-white px-5 py-2.5 text-xs font-bold transition hover:border-[#e0c3ad] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

/* -------------------------------------------------------------------------- */
/*  Dialogs                                                                   */
/* -------------------------------------------------------------------------- */

function AddRelativeDialog({
  data,
  defaultTargetId,
  onAdd,
  onClose,
}: {
  data: FamilyMapData;
  defaultTargetId: string;
  onAdd: (input: NewRelativeInput) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const [name, setName] = useState("");
  const [relationId, setRelationId] = useState("sibling");
  const [targetId, setTargetId] = useState(defaultTargetId);
  const [status, setStatus] = useState<Status>("unsure");
  const [consanguineous, setConsanguineous] = useState(false);
  const t = useTranslations("dashboard.family")
  const errorText = useAddErrorText();
  const relationLabels = useRelationLabels();

  const relation = RELATIONS.find((r) => r.id === relationId);
  const isPartner = relation?.kind === "partner";

  const problem = useMemo(() => {
    const preview = addRelative(
      data,
      { name: "preview", status, relationId, targetId, consanguineous },
      { person: "preview-person", union: "preview-union" },
    );
    // return "error" in preview ? preview.error : null;
    return "error" in preview ? errorText(preview.error) : null;
  }, [data, status, relationId, targetId, consanguineous, errorText]);

  const canSubmit = name.trim().length > 0 && problem === null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onAdd({
      name,
      status,
      relationId,
      targetId,
      consanguineous: isPartner ? consanguineous : false,
    });
  };

  return (
    <Modal
      // title="Add a relative"
      // description="Self-reported and private to you. Only add what you know."
      title={t("add.title")}
      description={t("add.description")}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={outlineBtn}>
            {/* Cancel */}
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form={formId}
            disabled={!canSubmit}
            className={primaryBtn}
          >
            {/* Add to map */}
            {t("add.submit")}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={`${formId}-name`} className="mb-1.5 block text-xs font-bold">
            {/* Name, or how you know them */}
            {t("add.name")}
          </label>
          <input
            id={`${formId}-name`}
            data-autofocus
            className={inputClass}
            value={name}
            maxLength={40}
            // placeholder="e.g. Aunt Zainab"
            placeholder={t("add.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${formId}-rel`} className="mb-1.5 block text-xs font-bold">
              {/* This person is the */}
              {t("add.relation")}
            </label>
            <select
              id={`${formId}-rel`}
              className={inputClass}
              value={relationId}
              onChange={(e) => setRelationId(e.target.value)}
            >
              {RELATIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {/* {r.label} */}
                  {relationLabels[r.id]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-target`} className="mb-1.5 block text-xs font-bold">
              {/* of */}
              {t("add.of")}
            </label>
            <select
              id={`${formId}-target`}
              className={inputClass}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isPartner && (
          <Checkbox checked={consanguineous} onChange={setConsanguineous}>
            {/* They are related by blood (cousins) */}
            {t("add.cousins")}
          </Checkbox>
        )}

        <StatusPicker value={status} onChange={setStatus} name={`${formId}-status`} />

        {problem && (
          <p
            role="alert"
            className="rounded-xl bg-[#fff3ea] px-3 py-2.5 text-xs leading-relaxed text-[#9a3412]"
          >
            {problem}
          </p>
        )}
      </form>
    </Modal>
  );
}

function EditPersonDialog({
  person,
  canRemove,
  onSave,
  onRemove,
  onClose,
}: {
  person: Person;
  canRemove: boolean;
  onSave: (patch: { name: string; status: Status }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const formId = useId();
  const [name, setName] = useState(person.name);
  const [status, setStatus] = useState<Status>(person.status);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const t = useTranslations("dashboard.family");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name, status });
  };

  return (
    <Modal
      // title={`Edit ${person.name}`}
      title={t("edit.title", { name: person.name })}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={outlineBtn}>
            {/* Cancel */}
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form={formId}
            disabled={!name.trim()}
            className={primaryBtn}
          >
            {/* Save changes */}
            {t("edit.save")}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={`${formId}-name`} className="mb-1.5 block text-xs font-bold">
            {/* Name */}
            {t("edit.name")}
          </label>
          <input
            id={`${formId}-name`}
            data-autofocus
            className={inputClass}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <StatusPicker value={status} onChange={setStatus} name={`${formId}-status`} />

        {canRemove && (
          <div className="border-t border-[#f6e9df] pt-4">
            {confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="me-auto text-xs text-[#6b6159]">
                  {/* Remove {person.name} from your map? */}
                  {t("edit.confirm", { name: person.name })}
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className={outlineBtn}
                >
                  {/* Keep */}
                  {t("edit.keep")} 
                </button>
                <button type="button" onClick={onRemove} className={darkBtn}>
                  {/* Remove */}
                  {t("edit.remove")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className={`text-xs font-bold text-[#9f1239] underline underline-offset-2 ${focusRing}`}
              >
                {/* Remove from map */}
                {t("edit.removeCta")}
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

function ShareDialog({
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
  const t = useTranslations("dashboard.family");

  return (
    <Modal
      // title={shared ? "Sharing with your counsellor" : "Share with my counsellor"}
      // description={
      //   shared
      //     ? "Your counsellor can see this family map. You can stop at any time."
      //     : "Your counsellor will see this map so you can talk it through together."
      // }
      title={shared ? t("share.titleOn") : t("share.titleOff")}
      description={shared ? t("share.descOn") : t("share.descOff")}
      onClose={onClose}
      footer={
        shared ? (
          <>
            <button type="button" onClick={onStop} className={outlineBtn}>
              {/* Stop sharing */}
              {t("share.stop")}
            </button>
            <button type="button" onClick={onClose} className={darkBtn}>
              {/* Done */}
              {t("share.done")}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className={outlineBtn}>
              {/* Cancel */}
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onShare}
              disabled={!understood}
              className={primaryBtn}
            >
              {/* Share family map */}
              {t("share.confirm")}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl bg-[#fff3ea] px-3 py-2.5 text-xs leading-relaxed text-[#6b6159]">
          {/* {peopleCount} {peopleCount === 1 ? "person" : "people"} on the map,{" "}
          {flaggedCount} with a known condition or carrier status. Test results
          from relatives are never included. */}
          {t("share.summary", { people: peopleCount, flagged: flaggedCount })}
        </p>
        {!shared && (
          <Checkbox checked={understood} onChange={setUnderstood}>
            <span data-autofocus>
              {/* I understand my counsellor will see names and conditions on this map. */}
              {t("share.understand")}
            </span>
          </Checkbox>
        )}
      </div>
    </Modal>
  );
}

const NOTICE_CONDITIONS = [
  "sickle_cell_disease",
  "beta_thalassemia",
  "alpha_thalassemia",
  "g6pd_deficiency",
  "cystic_fibrosis",
  "phenylketonuria",
  "spinal_muscular_atrophy",
  "gjb2_hearing_loss",
] as const;

function NotifyDialog({
  relatives,
  anonymous,
  onAnonymousChange,
  defaultLocale,
  onSend,
  onClose,
}: {
  relatives: Person[];
  anonymous: boolean;
  onAnonymousChange: (next: boolean) => void;
  defaultLocale: "ar" | "en";
  onSend: (payload: NotifyPayload) => Promise<NotifyResult>;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState<"sms" | "whatsapp">("whatsapp");
  const [locale, setLocale] = useState<"ar" | "en">(defaultLocale);
  const [includeCondition, setIncludeCondition] = useState(false);
  const [conditionId, setConditionId] = useState<string>(NOTICE_CONDITIONS[0]);
  const [signedName, setSignedName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("dashboard.family");
  const tNotice = useTranslations("notice.conditions");
  const ids = useId();

  const chosen = relatives.filter((r) => picked.includes(r.id));
  const nameOf = (index: number) => chosen[index]?.name ?? "";

  const toggle = (id: string, next: boolean) =>
    setPicked((prev) => (next ? [...prev, id] : prev.filter((p) => p !== id)));

  // The preview opens the relative's page in the chosen language, with these
  // options. Nothing is sent and no notice is created.
  const previewParams = new URLSearchParams({
    anonymous: anonymous ? "1" : "0",
    ...(includeCondition ? { condition: conditionId } : {}),
    ...(!anonymous && signedName.trim() ? { name: signedName.trim() } : {}),
  });
  const previewHref = `/${locale}/family-notice/preview?${previewParams}`;

  const send = async () => {
    if (!chosen.length || sending) return;
    const missing = chosen.findIndex((r) => !(phones[r.id] ?? "").trim());
    if (missing !== -1) {
      setError(t("notify.errors.phoneRequired", { name: nameOf(missing) }));
      document.getElementById(`${ids}-phone-${chosen[missing].id}`)?.focus();
      return;
    }
    if (!anonymous && !signedName.trim()) {
      setError(t("notify.errors.nameRequired"));
      document.getElementById(`${ids}-signed`)?.focus();
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await onSend({
        relativeIds: chosen.map((r) => r.id),
        phones: chosen.map((r) => phones[r.id] ?? ""),
        channel,
        locale,
        conditionId: includeCondition ? conditionId : null,
        anonymous,
        signedName: anonymous ? null : signedName.trim(),
      });
      if (result.status === "sent") return;
      setSending(false);
      if (result.status === "rate_limited") {
        setError(t("notify.errors.rateLimited", { remaining: result.remaining }));
      } else if (result.status === "invalid_phone" || result.status === "duplicate_phone") {
        setError(
          t(result.status === "invalid_phone" ? "notify.errors.invalidPhone" : "notify.errors.duplicatePhone", {
            name: nameOf(result.index),
          }),
        );
        document.getElementById(`${ids}-phone-${chosen[result.index]?.id}`)?.focus();
      } else if (result.status === "name_required") {
        setError(t("notify.errors.nameRequired"));
      } else {
        setError(t("notify.error"));
      }
    } catch {
      setError(t("notify.error"));
      setSending(false);
    }
  };

  const radio = (on: boolean) =>
    `flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-full border px-4 text-xs font-bold transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#c2410c] ${
      on ? "border-[#16110d] bg-[#16110d] text-white" : "border-[#f0e2d8] bg-white hover:border-[#e0c3ad]"
    }`;

  return (
    <Modal
      title={t("notify.title")}
      description={anonymous ? t("notify.descAnon") : t("notify.descNamed")}
      onClose={onClose}
      footer={
        <>
          <a
            href={previewHref}
            target="_blank"
            rel="noopener"
            className={`${outlineBtn} me-auto inline-flex items-center`}
          >
            {t("notify.preview")}
          </a>
          <button type="button" onClick={onClose} className={outlineBtn}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!picked.length || sending}
            className={primaryBtn}
          >
            {sending ? t("notify.sending") : picked.length ? t("notify.send", { count: picked.length }) : t("notify.sendNone")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <blockquote className="rounded-xl bg-[#fff3ea] px-3 py-2.5 text-xs leading-relaxed text-[#6b6159]">
          {/* The exact template relatives receive, with their link. No free text. */}
          {t("common.quote", { text: t("notifyMessage") })}
        </blockquote>

        <div className="flex items-center justify-between">
          <p className="text-xs font-bold">{t("notify.relatives")}</p>
          <div className="flex gap-3 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPicked(relatives.map((r) => r.id))}
              className={`underline underline-offset-2 ${focusRing}`}
            >
              {t("notify.selectAll")}
            </button>
            <button
              type="button"
              onClick={() => setPicked([])}
              className={`underline underline-offset-2 ${focusRing}`}
            >
              {t("notify.clear")}
            </button>
          </div>
        </div>

        {relatives.length === 0 ? (
          <p className="text-xs text-[#6b6159]">{t("notify.empty")}</p>
        ) : (
          <ul className="divide-y divide-[#f6e9df] rounded-2xl border border-[#f6e9df]">
            {relatives.map((r, i) => {
              const on = picked.includes(r.id);
              return (
                <li key={r.id} className="space-y-2 px-4 py-3">
                  <Checkbox checked={on} onChange={(next) => toggle(r.id, next)}>
                    <span
                      {...(i === 0 ? { "data-autofocus": true } : {})}
                      className="flex items-center gap-2"
                    >
                      <span
                        aria-hidden
                        className={`size-3 shrink-0 rounded-[3px] border ${STATUS_META[r.status].box}`}
                      />
                      <span className="font-semibold">{r.name}</span>
                    </span>
                  </Checkbox>
                  {on ? (
                    <div className="ps-6">
                      <label htmlFor={`${ids}-phone-${r.id}`} className="sr-only">
                        {t("notify.phoneLabel", { name: r.name })}
                      </label>
                      <input
                        id={`${ids}-phone-${r.id}`}
                        type="tel"
                        inputMode="tel"
                        autoComplete="off"
                        dir="ltr"
                        value={phones[r.id] ?? ""}
                        onChange={(e) => setPhones((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder={t("notify.phonePlaceholder")}
                        className={`${inputClass} text-start`}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {picked.length ? <p className="text-[11px] text-[#6b6159]">{t("notify.phoneHint")}</p> : null}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-bold">{t("notify.channel")}</legend>
          <div className="flex gap-2">
            {(["whatsapp", "sms"] as const).map((value) => (
              <label key={value} className={radio(channel === value)}>
                <input
                  type="radio"
                  name={`${ids}-channel`}
                  value={value}
                  checked={channel === value}
                  onChange={() => setChannel(value)}
                  className="sr-only"
                />
                {t(`notify.channels.${value}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-bold">{t("notify.language")}</legend>
          <div className="flex gap-2">
            {(["ar", "en"] as const).map((value) => (
              <label key={value} lang={value} className={radio(locale === value)}>
                <input
                  type="radio"
                  name={`${ids}-locale`}
                  value={value}
                  checked={locale === value}
                  onChange={() => setLocale(value)}
                  className="sr-only"
                />
                {value === "ar" ? "العربية" : "English"}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Checkbox checked={includeCondition} onChange={setIncludeCondition}>
            <span className="font-semibold">{t("notify.includeCondition")}</span>
            <span className="block text-[11px] text-[#6b6159]">{t("notify.includeConditionHint")}</span>
          </Checkbox>
          {includeCondition ? (
            <div className="ps-6">
              <label htmlFor={`${ids}-condition`} className="sr-only">
                {t("notify.conditionLabel")}
              </label>
              <select
                id={`${ids}-condition`}
                value={conditionId}
                onChange={(e) => setConditionId(e.target.value)}
                className={inputClass}
              >
                {NOTICE_CONDITIONS.map((id) => (
                  <option key={id} value={id}>
                    {tNotice(`${id}.name`)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Checkbox checked={anonymous} onChange={onAnonymousChange}>
            <span className="font-semibold">{t("tell.anonymous")}</span>
          </Checkbox>
          {!anonymous ? (
            <div className="ps-6">
              <label htmlFor={`${ids}-signed`} className="mb-1 block text-xs font-bold">
                {t("notify.signedName")}
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
              <p className="mt-1 text-[11px] text-[#6b6159]">{t("notify.signedHint")}</p>
            </div>
          ) : null}
        </div>

        {error && (
          <p role="alert" className="text-xs text-[#9a3412]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tree                                                                      */
/* -------------------------------------------------------------------------- */

function PersonNode({
  person,
  left,
  top,
  selected,
  onSelect,
}: {
  person: Person;
  left: number;
  top: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const isSelf = person.origin === "self";
  const t = useTranslations("dashboard.family.status");
  const labels = useStatusLabels();
  const note = person.statusNote === "shared" ? t("noteShared") : person.statusNote;
  const subtitle = `${labels.node[person.status]}${note ? ` (${note})` : ""}`;
  // const subtitle = `${STATUS_META[person.status].label}${
  //   person.statusNote ? ` (${person.statusNote})` : ""
  // }`;

  const border = selected
    ? "border-[1.5px] border-[#ff5a1f] shadow-[0_0_0_4px_rgba(255,90,31,0.18)]"
    : isSelf
      ? "border-[1.5px] border-[#16110d]"
      : person.status === "unsure"
        ? "border border-dashed border-[#d9ccc0]"
        : "border border-[#e9dfd6]";

  return (
    <button
      type="button"
      data-person={person.id}
      aria-pressed={selected}
      aria-label={`${person.name}, ${subtitle}`}
      onClick={() => onSelect(person.id)}
      style={{ left, top, width: NODE_W, height: NODE_H }}
      className={`absolute flex items-center gap-2 overflow-hidden rounded-xl bg-white px-2.5 py-0.5 text-start transition-shadow hover:shadow-[0_2px_8px_rgba(120,60,20,0.12)] ${border} ${focusRing}`}
    >
      <span
        aria-hidden
        dir="auto"
        className={`size-3 shrink-0 rounded-[3px] border ${STATUS_META[person.status].box}`}
      />
      <span className="min-w-0">
        <span className="block text-[10.5px] leading-[1.15] font-bold">
          {person.name}
        </span>
        <span className="block text-[9.5px] leading-[1.15] text-[#6b6159]">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

type DialogKind = "add" | "edit" | "share" | "notify" | null;

export default function FamilyMap({
  lang = "en",    
  initialData = DEFAULT_DATA,
  onChange,
  onShareChange,
  onNotify,
  openNotify = false,
  selfName = null,
}: FamilyMapProps) {
  const tSelf = useTranslations("dashboard.family");
  // The "you" box shows the person's own name, never a demo persona.
  const selfLabel = selfName ? tSelf("selfName", { name: selfName }) : tSelf("selfNoName");
  const [data, setData] = useState<FamilyMapData>(() => ({
    ...initialData,
    people: initialData.people.map((p) => (p.origin === "self" && !p.name ? { ...p, name: selfLabel } : p)),
  }));
  const [selectedId, setSelectedId] = useState("saeed");
  const [dialog, setDialog] = useState<DialogKind>(openNotify ? "notify" : null);
  const [anonymous, setAnonymous] = useState(true);
  const [shared, setShared] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Development only: the mocked SMS/WhatsApp links, to open on a second phone.
  const [devLinks, setDevLinks] = useState<string[]>([]);
  const t = useTranslations("dashboard.family");
  const format = useFormatter();
  const labels = useStatusLabels();
  const errorText = useAddErrorText();

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const firstSelection = useRef(true);

  const selected =
    data.people.find((p) => p.id === selectedId) ??
    data.people.find((p) => p.origin === "self") ??
    data.people[0] ??
    null;

  const commit = (next: FamilyMapData) => {
    setData(next);
    onChange?.(next);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Bring a newly chosen relative into view inside the horizontal scroller.
  useEffect(() => {
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    const scroller = scrollRef.current;
    const el = canvasRef.current?.querySelector<HTMLElement>(
      `[data-person="${CSS.escape(selectedId)}"]`,
    );
    if (!scroller || !el || scroller.scrollWidth <= scroller.clientWidth) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({
      left: Math.max(0, el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [selectedId]);

  /* ------------------------------ Layout maths ----------------------------- */

  const layout = useMemo(() => {
    const { people, unions } = data;
    if (!people.length) {
      return { width: 0, height: 0, ox: 0, oy: 0, path: "", labels: [] as { x: number; y: number }[] };
    }

    const minX = Math.min(...people.map((p) => p.x));
    const minY = Math.min(...people.map((p) => genY(p.gen)));
    const maxRight = Math.max(...people.map((p) => p.x + NODE_W));
    const maxBottom = Math.max(...people.map((p) => genY(p.gen) + NODE_H));
    const ox = PAD_X - minX;
    const oy = PAD_Y - minY;
    const width = maxRight - minX + PAD_X * 2;
    const height = maxBottom - minY + PAD_Y + 22;

    const map = indexPeople(people);
    const pos = (p: Person) => ({ x: p.x + ox, y: genY(p.gen) + oy });
    const segs: string[] = [];
    const labels: { x: number; y: number }[] = [];

    for (const u of unions) {
      const partners = u.partners.map((id) => map.get(id)).filter(isPerson);
      if (!partners.length) continue;
      const kids = u.children.map((id) => map.get(id)).filter(isPerson);

      let sx: number;
      let sy: number;
      if (partners.length >= 2) {
        const [a, b] = [...partners].sort((m, n) => m.x - n.x);
        const pa = pos(a);
        const pb = pos(b);
        const y = pa.y + NODE_H / 2;
        const x1 = pa.x + NODE_W;
        const x2 = pb.x;
        if (u.consanguineous) {
          segs.push(`M${x1} ${y - 2.5}H${x2}`, `M${x1} ${y + 2.5}H${x2}`);
          labels.push({ x: (x1 + x2) / 2, y: y + 8 });
        } else {
          segs.push(`M${x1} ${y}H${x2}`);
        }
        sx = (x1 + x2) / 2;
        sy = y;
      } else {
        const p = pos(partners[0]);
        sx = p.x + NODE_W / 2;
        sy = p.y + NODE_H;
      }

      if (kids.length) {
        const childY = Math.min(...kids.map((k) => pos(k).y));
        const barY = childY - BAR_GAP;
        const centres = kids.map((k) => pos(k).x + NODE_W / 2);
        const left = Math.min(sx, ...centres);
        const right = Math.max(sx, ...centres);
        segs.push(`M${sx} ${sy}V${barY}`);
        if (right > left) segs.push(`M${left} ${barY}H${right}`);
        for (const cx of centres) segs.push(`M${cx} ${barY}V${childY}`);
      }
    }

    return { width, height, ox, oy, path: segs.join(""), labels };
  }, [data]);

  /* -------------------------------- Handlers ------------------------------- */

  const flaggedCount = data.people.filter(
    (p) => p.status === "condition" || p.status === "carrier",
  ).length;
  const generations = new Set(data.people.map((p) => p.gen)).size;
  const relatives = data.people
    .filter((p) => p.origin !== "self")
    .sort((a, b) => a.gen - b.gen || a.x - b.x);

  const handleAdd = (input: NewRelativeInput) => {
    const result = addRelative(data, input, {
      person: uid("p"),
      union: uid("u"),
    });
    // if ("error" in result) {
    //   setToast(result.error);
    //   return;
    // }
    if ("error" in result) { setToast(errorText(result.error)); return; }
    commit(result.data);
    setSelectedId(result.id);
    setDialog(null);
    // setToast(`${input.name.trim()} added to your map.`);
    setToast(t("toast.added", { name: input.name.trim() }));
  };

  const handleSave = (patch: { name: string; status: Status }) => {
    if (!selected) return;
    commit({
      ...data,
      people: data.people.map((p) =>
        p.id === selected.id
          ? { ...p, name: patch.name.trim(), status: patch.status }
          : p,
      ),
    });
    setDialog(null);
    // setToast("Changes saved.");
    setToast(t("toast.saved"));

  };

  const handleRemove = () => {
    if (!selected) return;
    const next = removePerson(data, selected.id);
    commit(next);
    setSelectedId(next.people.find((p) => p.origin === "self")?.id ?? next.people[0]?.id ?? "");
    setDialog(null);
    // setToast(`${selected.name} removed from your map.`);
    setToast(t("toast.removed", { name: selected.name }));
  };

  const setSharing = (next: boolean) => {
    setShared(next);
    onShareChange?.(next);
    setDialog(null);
    // setToast(next ? "Shared with your counsellor." : "Sharing stopped.");
    setToast(next ? t("toast.sharedOn") : t("toast.sharedOff"));
  };

  const handleSend = async (payload: NotifyPayload): Promise<NotifyResult> => {
    const { relativeIds: _mapIds, ...wire } = payload;
    void _mapIds;
    const result: NotifyResult = onNotify
      ? await onNotify(wire)
      : { status: "sent", count: payload.phones.length, devLinks: [] };
    if (result.status !== "sent") return result;
    setDialog(null);
    setToast(t("toast.sent", { count: result.count }));
    if (result.devLinks.length) setDevLinks(result.devLinks);
    return result;
  };

  const info = selected ? describePerson(selected, data) : null;
  const originText: Record<Origin, string> = {
    added: t("selected.origin.added"),
    self: t("selected.origin.self"),
    shared: t("selected.origin.shared"),
  };
  const rel = info?.relation ?? null;
  const names = rel ? format.list(rel.names, { type: "conjunction" }) : "";
  const STATUS_ORDER: Status[] = ["condition", "carrier", "unsure", "none"];
  const relationText = !rel ? "" :
    rel.kind === "parentOf" ? t("selected.parentOf", { gender: rel.gender, names }) :
    rel.kind === "childOf" ? t("selected.childOf", { gender: rel.gender, names }) :
    t("selected.partnerOf", { gender: rel.gender, names });
  const statusText = selected && info
    ? t("selected.status", {
        label: labels.node[selected.status],
        known: info.known ? "yes" : "no",
        origin: originText[info.origin],
      })
    : "";

  /* --------------------------------- Render -------------------------------- */

  return (
    <div className="px-6 py-6 font-['Plus_Jakarta_Sans',ui-sans-serif,system-ui,sans-serif] text-[#16110d] antialiased">
      <div className="w-full">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
              {/* Family map */}
              {t("header.title")}
            </h1>
            <p className="mt-1 text-[13px] text-[#6b6159]">
              {/* {shared
                ? "Shared with your counsellor. You can stop at any time."
                : "Private to you unless you choose to share it."} */}
                {shared ? t("header.subtitleShared") : t("header.subtitlePrivate")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setDialog("share")}
              className={`inline-flex items-center gap-2 rounded-full border border-[#f0e2d8] bg-white px-5 py-2.5 text-sm font-semibold shadow-[0_1px_2px_rgba(120,60,20,0.05)] transition hover:border-[#e8c9b4] hover:bg-[#fffaf6] ${focusRing}`}
            >
              {shared ? (
                <Check className="size-4 text-[#15803d]" aria-hidden />
              ) : (
                <Calendar className="size-4" aria-hidden />
              )}
              {/* {shared ? "Shared with counsellor" : "Share with my counsellor"} */}
              {shared ? t("header.shared") : t("header.share")}
            </button>
            <button
              type="button"
              onClick={() => setDialog("add")}
              className={`rounded-full bg-[#ff5a1f] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#ea4c12] ${focusRing}`}
            >
              {/* Add a relative */}
              {t("header.add")}
            </button>
          </div>
        </header>

        {/* Privacy banner */}
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#fff0e6] px-4 py-3 text-[13px]">
          <Lock className="size-4 shrink-0 text-[#e8531c]" aria-hidden />
          <p>
            {/* Self-reported and{" "}
            <strong>{shared ? "shared with your counsellor" : "private to you"}</strong>
            . GeneBridge never pulls in a relative&rsquo;s test result. */}
            {t.rich(shared ? "banner.shared" : "banner.private", { b: (c) => <strong>{c}</strong> })}
          </p>
        </div>

        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_254px]">
          {/* Tree card */}
          <section aria-labelledby="family-title" className={`${cardClass} p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="family-title" className="text-base font-bold tracking-tight">
                {/* Your family */}
                {t("tree.title")}
              </h2>
              <p className="text-[11px] text-[#6b6159]">
                {/* {generations} {generations === 1 ? "generation" : "generations"} ·{" "}
                {data.people.length} {data.people.length === 1 ? "person" : "people"} */}
                {t("tree.counts", { generations, people: data.people.length })}
              </p>
            </div>

            <div
              ref={scrollRef}
              className="mt-4 overflow-x-auto pb-3"
              tabIndex={-1}
            >
              <div
                ref={canvasRef}
                role="group"
                // aria-label="Family tree"
                aria-label={t("tree.aria")}
                className="relative mx-auto"
                style={{ width: layout.width, height: layout.height }}
              >
                <svg
                  aria-hidden
                  width={layout.width}
                  height={layout.height}
                  className="pointer-events-none absolute inset-0"
                  fill="none"
                  stroke="#c4b6ab"
                  strokeWidth={2}
                  shapeRendering="crispEdges"
                >
                  <path d={layout.path} />
                </svg>

                {layout.labels.map((l, i) => (
                  <span
                    key={i}
                    className="absolute -translate-x-1/2 text-[10px] text-[#6b6159]"
                    style={{ left: l.x, top: l.y }}
                  >
                    {/* cousins */}
                    {t("tree.cousins")}
                  </span>
                ))}

                {data.people.map((p) => (
                  <PersonNode
                    key={p.id}
                    person={p}
                    left={p.x + layout.ox}
                    top={genY(p.gen) + layout.oy}
                    selected={selected?.id === p.id}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* Side column */}
          <aside className="flex flex-col gap-4">
            <section
              // aria-label="Selected relative"
              aria-label={t("selected.aria")}
              aria-live="polite"
              className={`${cardClass} p-5`}
            >
              <p className="text-[10px] font-semibold tracking-wide text-[#6b6159] uppercase">
                {/* Selected */}
                {t("selected.label")}
              </p>
              {selected && info ? (
                <>
                  <h2 className="mt-2.5 text-base font-extrabold tracking-tight">
                    {selected.name}
                  </h2>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[#6b6159]">
                    {/* {info.status} {info.relation} */}
                    {statusText} {relationText}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDialog("edit")}
                    className={`mt-3.5 rounded-full border border-[#f0e2d8] bg-white px-5 py-2 text-xs font-bold transition hover:border-[#e0c3ad] ${focusRing}`}
                  >
                    {/* Edit */}
                    {t("selected.edit")}
                  </button>
                </>
              ) : (
                <p className="mt-2.5 text-[13px] text-[#6b6159]">
                  {/* Select a relative on the map, or add one to get started. */}
                  {t("selected.empty")}
                </p>
              )}
            </section>

            <section aria-labelledby="tell-title" className={`${cardClass} p-5`}>
              <h2 id="tell-title" className="text-sm font-extrabold tracking-tight">
                {/* Tell relatives, privately */}
                {t("tell.title")}
              </h2>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-[#6b6159]">
                {/* Relatives in this branch may want to get tested. Your own result
                is never included. */}
                {t("tell.body")}
              </p>
              <blockquote className="mt-3.5 rounded-xl bg-[#fff3ea] px-3.5 py-3 text-[11.5px] leading-relaxed text-[#6b6159]">
                {/* &ldquo;{NOTIFY_MESSAGE}&rdquo; */}
                {t("common.quote", { text: t("notifyMessage") })}
              </blockquote>
              <Checkbox checked={anonymous} onChange={setAnonymous} className="mt-4">
                <span className="text-xs font-semibold">
                  {/* Send anonymously through GeneBridge */}
                  {t("tell.anonymous")}
                </span>
              </Checkbox>
              <button
                type="button"
                onClick={() => setDialog("notify")}
                className={`mt-4 w-full rounded-full bg-[#ff5a1f] px-5 py-3 text-[13px] font-bold text-white transition hover:bg-[#ea4c12] ${focusRing}`}
              >
                {/* Choose relatives to notify */}
                {t("tell.cta")}
              </button>
            </section>

            <section aria-labelledby="key-title" className={`${cardClass} p-5`}>
              <h2 id="key-title" className="text-base font-extrabold tracking-tight">
                {/* Key */}
                {t("key.title")}
              </h2>
              <ul className="mt-3 space-y-2 text-xs">
                {
                // (
                //   [
                //     ["condition", "Known condition"],
                //     ["carrier", "Carrier"],
                //     ["unsure", "Not sure"],
                //     ["none", "No known condition"],
                //   ] as [Status, string][]
                // )
                STATUS_ORDER.map((status) => (
                  <li key={status} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className={`size-3 rounded-[3px] border ${STATUS_META[status].box}`}
                    />
                    {labels.option[status]}
                  </li>
                ))}
                <li className="flex items-center gap-2.5">
                  <span aria-hidden className="flex w-3 flex-col gap-0.75">
                    <span className="h-[1.5px] bg-[#c4b6ab]" />
                    <span className="h-[1.5px] bg-[#c4b6ab]" />
                  </span>
                  {/* Marriage between cousins */}
                  {t("key.marriage")}
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>

      {dialog === "add" && (
        <AddRelativeDialog
          data={data}
          defaultTargetId={selected?.id ?? data.people[0]?.id ?? ""}
          onAdd={handleAdd}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "edit" && selected && (
        <EditPersonDialog
          person={selected}
          canRemove={selected.origin !== "self"}
          onSave={handleSave}
          onRemove={handleRemove}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "share" && (
        <ShareDialog
          shared={shared}
          peopleCount={data.people.length}
          flaggedCount={flaggedCount}
          onShare={() => setSharing(true)}
          onStop={() => setSharing(false)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "notify" && (
        <NotifyDialog
          relatives={relatives}
          anonymous={anonymous}
          onAnonymousChange={setAnonymous}
          defaultLocale={lang === "ar" ? "ar" : "en"}
          onSend={handleSend}
          onClose={() => setDialog(null)}
        />
      )}

      {devLinks.length > 0 && (
        <div
          role="region"
          aria-label={t("notify.devLinks.title")}
          className="fixed end-4 bottom-20 z-60 max-w-sm space-y-2 rounded-2xl bg-white p-4 text-xs shadow-lg ring-1 ring-[#f0e2d8]"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">{t("notify.devLinks.title")}</p>
            <button
              type="button"
              onClick={() => setDevLinks([])}
              aria-label={t("notify.devLinks.close")}
              className={`grid size-8 place-items-center rounded-full hover:bg-[#fff3ea] ${focusRing}`}
            >
              <X className="size-4" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {devLinks.map((link) => (
              <li key={link}>
                <a href={link} target="_blank" rel="noopener noreferrer" dir="ltr" className="break-all text-[#c2410c] underline">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-60 -translate-x-1/2 rounded-full bg-[#16110d] px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}