/**
 * BCT annexe taxonomy — protocol grammar (Doc 10 §15).
 *
 * The codes are immutable BCT identifiers from the official referential
 * (RCM00, RSM610, RSM620, …). They are NOT business values driven by the
 * applicative database — they are part of the regulatory contract and
 * never change at runtime. The associated `domainKey` is an i18n key
 * resolved via t() at render time, so labels stay trilingual.
 */

export const BCT_ANNEXE_GROUPS = [
  { domainKey: 'lib.domains.rcm', codes: ['RCM00'] },
  { domainKey: 'lib.domains.rsm', codes: ['RSM610', 'RSM620', 'RSM630', 'RSM640'] },
  { domainKey: 'lib.domains.rpla', codes: ['RPLA510'] },
  { domainKey: 'lib.domains.rpta', codes: ['RPTA910'] },
] as const;

export type BctAnnexeGroup = (typeof BCT_ANNEXE_GROUPS)[number];
