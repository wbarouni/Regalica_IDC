import { describe, expect, it, beforeAll } from 'vitest';

import i18n from '../../lib/i18n';

/**
 * Tranche 1 — fix #3 (regression test for the AR duplicate-key bug).
 *
 * Workspace.tsx KpiGrid (line ~138) renders 5 cells using
 * `key={c.label}` where each label is `t('kpi.<id>')`. If two of those
 * 5 i18n keys resolve to the SAME translated string in any language,
 * React emits "Encountered two children with the same key" and may
 * skip / duplicate cells silently.
 *
 * Audit Tranche 0.5 captured the bug in AR (`kpi.conformity` and
 * `kpi.pass` both translated to "المطابقة"). The fix in this commit
 * distinguishes `kpi.pass` → "القواعد المطابقة" (the conforming rules)
 * from `kpi.conformity` → "المطابقة" (the conformity rate).
 *
 * Doctrine: this test asserts the invariant SEMANTICALLY (5 distinct
 * resolved labels) for the 3 supported languages, instead of mounting
 * the full Workspace tree to spy on console.error — which would
 * couple the test to the rest of the page and break on any unrelated
 * warning. The duplicate-key warning is a strict consequence of two
 * identical labels, so the semantic invariant is sufficient.
 */

const KPI_KEYS = [
  'kpi.conformity',
  'kpi.evaluated',
  'kpi.pass',
  'kpi.failSevere',
  'kpi.failRounding',
] as const;

const LANGUAGES = ['fr', 'en', 'ar'] as const;

beforeAll(async () => {
  // Ensure the i18n instance has finished its async init before the
  // first changeLanguage call. The default lng is the browser one,
  // jsdom mimics navigator.language; we drive the language explicitly
  // per test so this beforeAll is just a guard.
  await i18n.loadLanguages(LANGUAGES as readonly string[]);
});

describe('kpi.* labels are distinct across all supported languages', () => {
  it.each(LANGUAGES)(
    'lang=%s — every kpi.* key resolves to a unique label (no React key collision)',
    async (lang) => {
      await i18n.changeLanguage(lang);
      const labels = KPI_KEYS.map((k) => i18n.t(k));
      const unique = new Set(labels);
      expect(unique.size).toBe(KPI_KEYS.length);
      // Belt-and-suspenders: every label must be a non-empty string.
      // A missing translation falls back to the key itself, which would
      // accidentally pass the uniqueness check via the dotted key.
      for (const label of labels) {
        expect(typeof label).toBe('string');
        expect((label as string).length).toBeGreaterThan(0);
        expect(label).not.toContain('kpi.');
      }
    },
  );

  it('lang=ar — kpi.conformity and kpi.pass resolve to distinct strings (the bug fixed by this commit)', async () => {
    await i18n.changeLanguage('ar');
    const conformity = i18n.t('kpi.conformity');
    const pass = i18n.t('kpi.pass');
    expect(conformity).not.toBe(pass);
  });
});
