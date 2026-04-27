/**
 * REGFlow — Phase B: rule grouping.
 *
 * Phase B groups rules by their bearer annexe (`axTerm`) without doing
 * any computation. An inter-annexe rule (where some terms reference a
 * different annexe via `axOrigine`) belongs to the group of its bearer
 * annexe only — never to the groups of its source annexes. This matches
 * the AS-IS algorithm: the bearer annexe is the single owner of the
 * verdict for the rule.
 *
 * The loader already sorts rules by (axTerm asc, numRegle asc), so
 * insertion order into each bucket preserves the deterministic
 * intra-group ordering required for stable verdicts. The Map iterator
 * keeps insertion order of keys, which mirrors the first-seen axTerm
 * order from the input array.
 */

import type { RuleWithTerms } from './types.js';

export function groupRulesByAnnexe(rules: readonly RuleWithTerms[]): Map<string, RuleWithTerms[]> {
  const groups = new Map<string, RuleWithTerms[]>();
  for (const rule of rules) {
    const bucket = groups.get(rule.axTerm);
    if (bucket) {
      bucket.push(rule);
    } else {
      groups.set(rule.axTerm, [rule]);
    }
  }
  return groups;
}
