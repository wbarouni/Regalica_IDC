import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import i18n from '../lib/i18n';

import { EngineErrorArtefact } from './EngineErrorArtefact';

/**
 * Tranche 1 — fix #1 unit test (SSE error listener).
 *
 * The component renders the localised label for one of the 6 canonical
 * engine error codes (apps/api/seeds/run_error_codes.json) or falls
 * back to `error.engine.unknown` and surfaces the raw SSE `message`
 * payload as a secondary line.
 *
 * The tests below drive the real i18n instance across FR/EN/AR so a
 * future locale edit that drops one of the 6 codes from `error.engine.*`
 * (or removes `error.engineErrorTitle`) is caught here, on top of the
 * structural parity guard in locales/__tests__/keys-coverage.test.ts.
 */

const KNOWN_CODES = [
  't0_xsd_invalid',
  't0_embedded_fail',
  't0_parse_error',
  't1_engine_exception',
  't1_no_verdicts',
  't1_timeout',
] as const;

const LANGUAGES = ['fr', 'en', 'ar'] as const;

beforeAll(async () => {
  await i18n.loadLanguages(LANGUAGES as readonly string[]);
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('<EngineErrorArtefact>', () => {
  it.each(LANGUAGES)(
    'lang=%s — every known code resolves to a localised non-key string',
    async (lang) => {
      await i18n.changeLanguage(lang);
      for (const code of KNOWN_CODES) {
        const { unmount } = renderWithI18n(<EngineErrorArtefact code={code} message={code} />);
        const artefact = screen.getByTestId('engine-error-artefact');
        expect(artefact).toBeInTheDocument();
        // The localised label must NOT equal the dotted i18n key (which
        // would be the i18next missing-key fallback).
        expect(artefact.textContent ?? '').not.toContain(`error.engine.${code}`);
        // The raw error code is shown in the small-cap title row
        // ("error.engineErrorTitle · <code>") so the operator can
        // reference it in support tickets.
        expect(artefact.textContent ?? '').toContain(code);
        unmount();
      }
    },
  );

  it('lang=fr — t0_xsd_invalid resolves to the seeded FR label verbatim', async () => {
    await i18n.changeLanguage('fr');
    renderWithI18n(<EngineErrorArtefact code="t0_xsd_invalid" message="t0_xsd_invalid" />);
    expect(
      screen.getByText('Structure XSD invalide. Le fichier XML ne respecte pas le schéma BCT.'),
    ).toBeInTheDocument();
  });

  it('lang=en — t1_no_verdicts resolves to the seeded EN label verbatim', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<EngineErrorArtefact code="t1_no_verdicts" message="t1_no_verdicts" />);
    expect(
      screen.getByText(
        'RDG engine produced no verdicts for this run (empty rule set or applicable_total is zero).',
      ),
    ).toBeInTheDocument();
  });

  it('lang=ar — t1_timeout resolves to the seeded AR label verbatim', async () => {
    await i18n.changeLanguage('ar');
    renderWithI18n(<EngineErrorArtefact code="t1_timeout" message="t1_timeout" />);
    expect(
      screen.getByText('لم يستجب محرك RDG في الوقت المحدد. يرجى إعادة المحاولة.'),
    ).toBeInTheDocument();
  });

  it('falls back to error.engine.unknown for an unrecognised code and surfaces the raw message', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(
      <EngineErrorArtefact code="t99_brand_new" message="something the engine wrote" />,
    );
    // The fallback localised label.
    expect(screen.getByText('Unexpected validation error.')).toBeInTheDocument();
    // The raw engine message is surfaced as a secondary line so the
    // operator still has the engine's machine-readable hint.
    expect(screen.getByText('something the engine wrote')).toBeInTheDocument();
    // The unknown code itself appears in the title row.
    expect(screen.getByTestId('engine-error-artefact').textContent ?? '').toContain(
      't99_brand_new',
    );
  });

  it('does not render the secondary message line when message equals code (no extra noise)', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<EngineErrorArtefact code="t0_parse_error" message="t0_parse_error" />);
    // The code appears once (in the title row), and the localised
    // label appears once. The raw message duplicate line must not
    // render when message === code, since it would be redundant.
    const artefact = screen.getByTestId('engine-error-artefact');
    const codeOccurrences = (artefact.textContent ?? '').split('t0_parse_error').length - 1;
    expect(codeOccurrences).toBe(1);
  });

  it('exposes role="alert" so screen readers announce the engine error immediately', () => {
    renderWithI18n(<EngineErrorArtefact code="t0_xsd_invalid" message="t0_xsd_invalid" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
