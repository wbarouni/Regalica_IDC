import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import i18n from '../lib/i18n';

import { LaunchErrorArtefact } from './LaunchErrorArtefact';

/**
 * Tranche 1.1 — fix #2 unit tests (close the silent-swallow debt).
 *
 * The component renders the localised label for one of the 10
 * canonical /runs error codes (frontend config, backend route,
 * generic transport) and falls back to `error.launch.unknown` for
 * anything else. The raw `message` payload is surfaced as a
 * secondary line for unknown codes only — known codes already have
 * a hand-written label.
 *
 * Tests drive the real i18n instance across FR/EN/AR so a future
 * locale edit that drops one of the 10 codes is caught here.
 * Structural parity is also enforced by the keys-coverage test.
 */

const KNOWN_CODES = [
  'MISSING_TENANT_ID',
  'MISSING_API_URL',
  'MISSING_USER_ID',
  'INVALID_BODY',
  'PRIMARY_NOT_IN_LIST',
  'UPLOAD_NOT_OWNED',
  'TABLE_NOT_IMPLEMENTED',
  'COLUMN_NOT_FOUND',
  'INTERNAL',
  'HTTP_ERROR',
] as const;

const LANGUAGES = ['fr', 'en', 'ar'] as const;

beforeAll(async () => {
  await i18n.loadLanguages(LANGUAGES as readonly string[]);
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('<LaunchErrorArtefact>', () => {
  it.each(LANGUAGES)(
    'lang=%s — every known code resolves to a localised non-key string',
    async (lang) => {
      await i18n.changeLanguage(lang);
      for (const code of KNOWN_CODES) {
        const { unmount } = renderWithI18n(
          <LaunchErrorArtefact code={code} message="server message" />,
        );
        const artefact = screen.getByTestId('launch-error-artefact');
        expect(artefact).toBeInTheDocument();
        expect(artefact.textContent ?? '').not.toContain(`error.launch.${code}`);
        expect(artefact.textContent ?? '').toContain(code);
        unmount();
      }
    },
  );

  it('lang=fr — UPLOAD_NOT_OWNED resolves to the seeded FR label verbatim', async () => {
    await i18n.changeLanguage('fr');
    renderWithI18n(<LaunchErrorArtefact code="UPLOAD_NOT_OWNED" message="403" />);
    expect(
      screen.getByText("Le fichier sélectionné n'appartient pas à votre établissement."),
    ).toBeInTheDocument();
  });

  it('lang=en — COLUMN_NOT_FOUND resolves to the seeded EN label verbatim', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<LaunchErrorArtefact code="COLUMN_NOT_FOUND" message="42703" />);
    expect(
      screen.getByText(
        'Database schema out of sync — missing migration. Contact your administrator.',
      ),
    ).toBeInTheDocument();
  });

  it('lang=ar — INTERNAL resolves to the seeded AR label verbatim', async () => {
    await i18n.changeLanguage('ar');
    renderWithI18n(<LaunchErrorArtefact code="INTERNAL" message="500" />);
    expect(
      screen.getByText('خطأ داخلي في الخادم. يرجى إعادة المحاولة بعد قليل.'),
    ).toBeInTheDocument();
  });

  it('falls back to error.launch.unknown for an unrecognised code and surfaces the raw message', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<LaunchErrorArtefact code="BRAND_NEW_CODE" message="something the api wrote" />);
    expect(
      screen.getByText('Unexpected launch error. Please refer to the technical code below.'),
    ).toBeInTheDocument();
    expect(screen.getByText('something the api wrote')).toBeInTheDocument();
    expect(screen.getByTestId('launch-error-artefact').textContent ?? '').toContain(
      'BRAND_NEW_CODE',
    );
  });

  it('does not duplicate the raw message line when message equals code (no extra noise)', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<LaunchErrorArtefact code="INTERNAL" message="INTERNAL" />);
    const artefact = screen.getByTestId('launch-error-artefact');
    const codeOccurrences = (artefact.textContent ?? '').split('INTERNAL').length - 1;
    // Code appears once in the title row only; no secondary raw-message
    // line for known codes.
    expect(codeOccurrences).toBe(1);
  });

  it('exposes role="alert" so screen readers announce the failure immediately', () => {
    renderWithI18n(<LaunchErrorArtefact code="INTERNAL" message="500" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
