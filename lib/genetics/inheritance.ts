/**
 * The inheritance engine (task 06). Deterministic: every risk number shown
 * anywhere in GeneBridge, including in Ask GeneBridge replies, comes from
 * here, never from the AI model. The Inheritance Simulator uses the same
 * engine for its expected counts.
 *
 * Chances are "for each pregnancy" and "the same every time" (guardrail 3).
 * Dominant and X-linked results are always followed by an offer to talk to a
 * counsellor (guardrail 5, PROJECT.md section 8).
 */

export const patterns = ['autosomal_recessive', 'autosomal_dominant', 'x_linked'] as const;
export type InheritancePattern = (typeof patterns)[number];

/**
 * A parent's status for the condition.
 * - Recessive: unaffected (no changed copy), carrier (one), affected (two).
 * - Dominant: unaffected or affected (one changed copy is enough).
 * - X-linked: the mother may be unaffected, a carrier or affected; the father
 *   unaffected or affected (he has one X).
 */
export const parentStatuses = ['unaffected', 'carrier', 'affected'] as const;
export type ParentStatus = (typeof parentStatuses)[number];

/** Whole percentages for each pregnancy. They always add up to 100. */
export type Chances = { affected: number; carrier: number; unaffected: number };

export type InheritanceResult = {
  pattern: InheritancePattern;
  parent1: ParentStatus;
  parent2: ParentStatus;
  /** For each pregnancy, whatever the baby's sex. */
  chances: Chances;
  /** X-linked only: chances for a son and for a daughter. */
  bySex?: { son: Chances; daughter: Chances };
  /** Dominant and X-linked: always followed by a counsellor offer. */
  escalate: boolean;
};

export class InheritanceInputError extends Error {}

/** A copy of the gene: typical ('A') or changed ('a'). 'Y' is the father's Y. */
export type Allele = 'A' | 'a' | 'Y';

function autosomal(status: ParentStatus, pattern: InheritancePattern): [Allele, Allele] {
  if (pattern === 'autosomal_dominant' && status === 'carrier') {
    // In a dominant condition one changed copy causes it: there are no carriers.
    throw new InheritanceInputError('A dominant condition has no carriers');
  }
  if (status === 'unaffected') return ['A', 'A'];
  if (status === 'carrier') return ['A', 'a'];
  // Dominant: "affected" means one changed copy (by far the usual case).
  return pattern === 'autosomal_dominant' ? ['A', 'a'] : ['a', 'a'];
}

function mother(status: ParentStatus): [Allele, Allele] {
  if (status === 'unaffected') return ['A', 'A'];
  if (status === 'carrier') return ['A', 'a'];
  return ['a', 'a'];
}

function father(status: ParentStatus): [Allele, Allele] {
  if (status === 'carrier') {
    throw new InheritanceInputError('A father has one X, so he cannot be an X-linked carrier');
  }
  return status === 'unaffected' ? ['A', 'Y'] : ['a', 'Y'];
}

export type Outcome = keyof Chances;

/**
 * Which statuses make sense for a parent in a pattern. A dominant condition
 * has no carriers, and an X-linked father (parent 2) has one X, so he either
 * has the changed copy or not.
 */
export function statusesFor(pattern: InheritancePattern, parent: 1 | 2): ParentStatus[] {
  if (pattern === 'autosomal_dominant') return ['unaffected', 'affected'];
  if (pattern === 'x_linked' && parent === 2) return ['unaffected', 'affected'];
  return ['unaffected', 'carrier', 'affected'];
}

/**
 * The two copies a parent can pass on. For X-linked, parent 1 is the mother
 * and parent 2 the father (whose second "copy" is his Y).
 */
export function parentCopies(
  pattern: InheritancePattern,
  parent: 1 | 2,
  status: ParentStatus,
): [Allele, Allele] {
  if (pattern === 'x_linked') return parent === 1 ? mother(status) : father(status);
  return autosomal(status, pattern);
}

export type Child = { outcome: Outcome; sex?: 'son' | 'daughter' };

/** The child made from one copy of each parent. X-linked children have a sex. */
export function childOf(pattern: InheritancePattern, fromParent1: Allele, fromParent2: Allele): Child {
  const outcome = outcomeOf(pattern, fromParent1, fromParent2);
  if (pattern !== 'x_linked') return { outcome };
  return { outcome, sex: fromParent1 === 'Y' || fromParent2 === 'Y' ? 'son' : 'daughter' };
}

function outcomeOf(pattern: InheritancePattern, x: Allele, y: Allele): Outcome {
  const changed = [x, y].filter((c) => c === 'a').length;
  if (pattern === 'autosomal_dominant') return changed > 0 ? 'affected' : 'unaffected';
  if (pattern === 'x_linked' && (x === 'Y' || y === 'Y')) {
    // A son has one X: one changed copy means he is affected.
    return changed > 0 ? 'affected' : 'unaffected';
  }
  if (changed === 2) return 'affected';
  return changed === 1 ? 'carrier' : 'unaffected';
}

/** Turns counts out of `total` equally likely combinations into whole percentages. */
function percentages(counts: Chances, total: number): Chances {
  return {
    affected: (100 * counts.affected) / total,
    carrier: (100 * counts.carrier) / total,
    unaffected: (100 * counts.unaffected) / total,
  };
}

function empty(): Chances {
  return { affected: 0, carrier: 0, unaffected: 0 };
}

/**
 * Chances for each pregnancy. For X-linked, parent1 is the mother and
 * parent2 the father. Throws InheritanceInputError for impossible inputs.
 */
export function calculateInheritance(
  pattern: InheritancePattern,
  parent1: ParentStatus,
  parent2: ParentStatus,
): InheritanceResult {
  if (!patterns.includes(pattern)) throw new InheritanceInputError(`Unknown pattern ${pattern}`);
  for (const p of [parent1, parent2]) {
    if (!parentStatuses.includes(p)) throw new InheritanceInputError(`Unknown status ${p}`);
  }

  const p1 = parentCopies(pattern, 1, parent1);
  const p2 = parentCopies(pattern, 2, parent2);

  // All four combinations (one copy from each parent) are equally likely.
  const all = empty();
  const son = empty();
  const daughter = empty();
  for (const a of p1) {
    for (const b of p2) {
      const outcome = outcomeOf(pattern, a, b);
      all[outcome]++;
      if (pattern === 'x_linked') (b === 'Y' ? son : daughter)[outcome]++;
    }
  }

  return {
    pattern,
    parent1,
    parent2,
    chances: percentages(all, 4),
    bySex:
      pattern === 'x_linked'
        ? { son: percentages(son, 2), daughter: percentages(daughter, 2) }
        : undefined,
    escalate: pattern !== 'autosomal_recessive',
  };
}

/** Every number the engine can return for a result, for the output check. */
export function numbersIn(result: InheritanceResult): number[] {
  const sets = [result.chances, result.bySex?.son, result.bySex?.daughter].filter(
    (c): c is Chances => Boolean(c),
  );
  return sets.flatMap((c) => [c.affected, c.carrier, c.unaffected]);
}

/**
 * Expected counts out of `runs` pregnancies, for the simulator's
 * "counts vs expected".
 */
export function expectedCounts(result: InheritanceResult, runs: number): Chances {
  return {
    affected: (result.chances.affected * runs) / 100,
    carrier: (result.chances.carrier * runs) / 100,
    unaffected: (result.chances.unaffected * runs) / 100,
  };
}
