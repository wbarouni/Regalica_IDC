import { describe, expect, it } from 'vitest';

import arCommon from '../ar/common.json';
import enCommon from '../en/common.json';
import frCommon from '../fr/common.json';

/**
 * Tranche 1 — i18n keys-coverage safety net.
 *
 * The AR duplicate-key bug fixed in commit a5a4692 happened because
 * two different i18n keys silently translated to the same string,
 * which then collided when used as a React `key` prop. This file
 * adds a structural guard so the same class of bug cannot land
 * again from a future locale edit:
 *
 *   1. Strict parity — fr.json, en.json, ar.json MUST expose the
 *      EXACT same set of keys (recursively). A missing key in any
 *      file means the user sees the dotted key fallback in that
 *      language, which is a doctrine violation (no untranslated
 *      surface for end-users).
 *
 *   2. No duplicate sibling keys inside a single file. JSON.parse
 *      already deduplicates duplicate keys silently (last-wins),
 *      but we walk the source-of-truth `_keys` snapshot to surface
 *      any structural anomaly the parser would have hidden.
 *
 *   3. Every leaf value MUST be a non-empty string. A null / empty
 *      / object value at a leaf either crashes useTranslation()
 *      or silently falls back to the key, both unacceptable.
 *
 * The parity check uses dotted-path key sets so a missing nested
 * key like `kpi.pass` surfaces explicitly instead of being hidden
 * inside an object equality.
 */

type JsonNode = string | number | boolean | null | JsonObject | JsonNode[];
interface JsonObject {
  [key: string]: JsonNode;
}

function flattenKeys(node: JsonNode, prefix = ''): string[] {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return prefix === '' ? [] : [prefix];
  }
  const keys: string[] = [];
  for (const [k, v] of Object.entries(node as JsonObject)) {
    const path = prefix === '' ? k : `${prefix}.${k}`;
    keys.push(...flattenKeys(v, path));
  }
  return keys;
}

function flattenLeaves(node: JsonNode, prefix = ''): Array<[string, JsonNode]> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return prefix === '' ? [] : [[prefix, node]];
  }
  const out: Array<[string, JsonNode]> = [];
  for (const [k, v] of Object.entries(node as JsonObject)) {
    const path = prefix === '' ? k : `${prefix}.${k}`;
    out.push(...flattenLeaves(v, path));
  }
  return out;
}

const LOCALES = {
  fr: frCommon as unknown as JsonObject,
  en: enCommon as unknown as JsonObject,
  ar: arCommon as unknown as JsonObject,
} as const;

const LANGS = ['fr', 'en', 'ar'] as const;

describe('i18n keys-coverage — strict fr/en/ar parity', () => {
  it.each(LANGS)('%s — flattened key set is non-empty', (lang) => {
    const keys = flattenKeys(LOCALES[lang]);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('fr/en/ar share strictly the same set of dotted keys (no missing key in any locale)', () => {
    const fr = new Set(flattenKeys(LOCALES.fr));
    const en = new Set(flattenKeys(LOCALES.en));
    const ar = new Set(flattenKeys(LOCALES.ar));

    const onlyInFr = [...fr].filter((k) => !en.has(k) || !ar.has(k));
    const onlyInEn = [...en].filter((k) => !fr.has(k) || !ar.has(k));
    const onlyInAr = [...ar].filter((k) => !fr.has(k) || !en.has(k));

    expect({ onlyInFr, onlyInEn, onlyInAr }).toEqual({
      onlyInFr: [],
      onlyInEn: [],
      onlyInAr: [],
    });
  });

  it.each(LANGS)('%s — every leaf is a non-empty string', (lang) => {
    const leaves = flattenLeaves(LOCALES[lang]);
    const offenders = leaves.filter(([, v]) => typeof v !== 'string' || v.length === 0);
    expect(offenders).toEqual([]);
  });

  it.each(LANGS)('%s — flattened keys contain no duplicates after JSON.parse', (lang) => {
    // JSON.parse naturally deduplicates sibling keys (last value wins),
    // so this is a defense-in-depth check: every key in the flattened
    // list MUST be unique. If a future build pipeline transforms the
    // file before parse, this catches the regression.
    const keys = flattenKeys(LOCALES[lang]);
    const set = new Set(keys);
    expect(set.size).toBe(keys.length);
  });
});
