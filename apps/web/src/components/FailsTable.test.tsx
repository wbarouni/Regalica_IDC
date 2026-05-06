import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '../lib/i18n';

import { FailsTable } from './FailsTable';

beforeAll(async () => {
  await i18n.loadLanguages(['fr', 'en', 'ar']);
  await i18n.changeLanguage('fr');
});

function renderWithI18n(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

vi.mock('../lib/config', () => ({
  API_URL: 'http://api.test',
  CHATBOT_URL: 'http://chatbot.test',
  TENANT_ID: '00000000-0000-7000-8000-0000000000aa',
  USER_ID: '00000000-0000-7000-8000-0000000000bb',
  DEFAULT_PAGE_SIZE: 50,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

const RUN_ID = '11111111-1111-7111-8111-111111111111';

function failRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '22222222-2222-7222-8222-222222222222',
    ax_term: '630',
    num_regle: 266,
    operateur: '=',
    regle_label: 'Test rule',
    severity: 'severe',
    expected_value: 100,
    computed_value: 80,
    gap_absolute: 20,
    gap_relative: 0.2,
    cluster_id: null,
    is_sentinel_iteration: false,
    iteration_index: null,
    created_at: '2026-05-04T10:00:00Z',
    rubrique_codes: [],
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('FailsTable', () => {
  it('shows empty state when no fails are returned', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { ts: '', version: '1', total: 0 } }),
    );
    renderWithI18n(<FailsTable runId={RUN_ID} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // FR locale (set in beforeAll) → "Aucun FAIL à afficher."
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Aucun FAIL/i));
  });

  it('renders a row per fail with annexe + rule + severity badge + gap', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          failRow({ ax_term: '630', num_regle: 266, severity: 'severe', gap_relative: 0.23 }),
          failRow({
            id: 'r2',
            ax_term: '00',
            num_regle: 12,
            severity: 'rounding',
            gap_relative: 0.001,
            gap_absolute: 1,
          }),
        ],
        meta: { ts: '', version: '1', total: 2 },
      }),
    );
    renderWithI18n(<FailsTable runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByText('630')).toBeTruthy());
    expect(screen.getByText('266')).toBeTruthy();
    expect(screen.getByText('00')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    // Severity badges
    expect(screen.getByText('Sévère')).toBeTruthy();
    expect(screen.getByText('Arrondi')).toBeTruthy();
    // gap_relative formatted as percentage via shared `formatBankingPercent`
    // helper. fr-FR locale uses comma decimal separator: "23,00 %".
    expect(screen.getByText('23,00 %')).toBeTruthy();
  });

  it('hits /api/tenants/:tenantId/runs/:runId/fails with filter=all by default', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { ts: '', version: '1', total: 0 } }),
    );
    renderWithI18n(<FailsTable runId={RUN_ID} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toMatch(
      new RegExp(
        `^http://api.test/api/tenants/00000000-0000-7000-8000-0000000000aa/runs/${RUN_ID}/fails`,
      ),
    );
    expect(url).toContain('filter=all');
  });

  it('shows error state when the fetch returns non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'RUN_NOT_FOUND', message: 'no run' } }, 404),
    );
    renderWithI18n(<FailsTable runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/RUN_NOT_FOUND/i));
  });

  // A — RDG-native columns (Expected/RHS, Computed/LHS, Gap) with banking
  // number format (fr-FR thin-space thousands + comma decimal).
  it('A — renders Expected (RHS) and Computed (LHS) columns with fr-FR banking format', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          failRow({
            ax_term: '630',
            num_regle: 266,
            severity: 'severe',
            expected_value: 57985.238,
            computed_value: 58028.376,
            gap_absolute: 43.138,
            gap_relative: 0.000744,
          }),
        ],
        meta: { ts: '', version: '1', total: 1 },
      }),
    );
    renderWithI18n(<FailsTable runId={RUN_ID} />);
    // RHS / expected_value → "57 985,238" (fr-FR thin-space + comma).
    await waitFor(() =>
      expect(screen.getByText((c) => c.replace(/\s/g, ' ').includes('57 985,238'))).toBeTruthy(),
    );
    // LHS / computed_value → "58 028,376".
    expect(screen.getByText((c) => c.replace(/\s/g, ' ').includes('58 028,376'))).toBeTruthy();
    // Gap → "43,138".
    expect(screen.getByText((c) => c.includes('43,138'))).toBeTruthy();
    // Headers translated through i18n (FR by default).
    expect(screen.getByText('Attendu (RHS)')).toBeTruthy();
    expect(screen.getByText('Calculé (LHS)')).toBeTruthy();
  });

  it('A — renders em dash for null expected/computed/gap values', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          failRow({
            expected_value: null,
            computed_value: null,
            gap_absolute: null,
            gap_relative: null,
          }),
        ],
        meta: { ts: '', version: '1', total: 1 },
      }),
    );
    renderWithI18n(<FailsTable runId={RUN_ID} />);
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4));
  });
});
