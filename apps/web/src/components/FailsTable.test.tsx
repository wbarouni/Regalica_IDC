import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FailsTable } from './FailsTable';

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
    render(<FailsTable runId={RUN_ID} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/no fails/i));
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
    render(<FailsTable runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByText('630')).toBeTruthy());
    expect(screen.getByText('266')).toBeTruthy();
    expect(screen.getByText('00')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    // Severity badges
    expect(screen.getByText('Sévère')).toBeTruthy();
    expect(screen.getByText('Arrondi')).toBeTruthy();
    // gap_relative formatted as percentage
    expect(screen.getByText('23.00 %')).toBeTruthy();
  });

  it('hits /api/tenants/:tenantId/runs/:runId/fails with filter=all by default', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { ts: '', version: '1', total: 0 } }),
    );
    render(<FailsTable runId={RUN_ID} />);
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
    render(<FailsTable runId={RUN_ID} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/RUN_NOT_FOUND/i));
  });
});
