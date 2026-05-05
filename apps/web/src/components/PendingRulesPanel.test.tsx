import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '../lib/i18n';

import { PendingRulesPanel } from './PendingRulesPanel';

vi.mock('../lib/config', () => ({
  API_URL: 'http://api.test',
  CHATBOT_URL: 'http://chatbot.test',
  TENANT_ID: '00000000-0000-7000-8000-0000000000aa',
  USER_ID: '00000000-0000-7000-8000-0000000000bb',
}));

const fetchApiMock = vi.fn();
vi.mock('../lib/fetchApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/fetchApi')>('../lib/fetchApi');
  return {
    ...actual,
    fetchApi: (...args: unknown[]) => fetchApiMock(...args),
  };
});

const LANGUAGES = ['fr', 'en', 'ar'] as const;

beforeAll(async () => {
  await i18n.loadLanguages(LANGUAGES as readonly string[]);
});

function renderPanel() {
  return render(
    <I18nextProvider i18n={i18n}>
      <PendingRulesPanel />
    </I18nextProvider>,
  );
}

function pendingRule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '00000000-0000-7000-8000-000000000aa1',
    ax_term: '00',
    num_regle: 42,
    operator: '=',
    natural_language: 'Le total de la rubrique doit être égal à la somme des sous-rubriques.',
    terms_count: 4,
    version: 2,
    status: 'pending_review',
    valid_from: '2026-01-01',
    is_inter_annexe: false,
    author_user_id: '2cb0ce35-4b43-499f-b23a-722ef86902ce',
    created_at: '2026-04-15T08:30:00.000Z',
    ...overrides,
  };
}

describe('<PendingRulesPanel> — K3', () => {
  beforeEach(async () => {
    fetchApiMock.mockReset();
    await i18n.changeLanguage('fr');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the empty state when the API returns zero pending rules', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: [],
      meta: { ts: '', version: '1' },
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Aucune règle en attente de revue.')).toBeInTheDocument();
    });
    expect(fetchApiMock).toHaveBeenCalledWith(expect.stringContaining('/rules/pending-review'));
  });

  it('renders the table with author + dd/mm/yyyy submitted date when rules are present', async () => {
    fetchApiMock.mockResolvedValueOnce({
      data: [
        pendingRule({ ax_term: '00', num_regle: 42 }),
        pendingRule({
          id: '00000000-0000-7000-8000-000000000aa2',
          ax_term: '630',
          num_regle: 17,
          author_user_id: null,
          created_at: '2026-03-08T14:00:00.000Z',
        }),
      ],
      meta: { ts: '', version: '1' },
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('00/42')).toBeInTheDocument();
    });
    // Banking date format dd/mm/yyyy.
    expect(screen.getByText('15/04/2026')).toBeInTheDocument();
    expect(screen.getByText('08/03/2026')).toBeInTheDocument();
    // Author UUID short form.
    expect(screen.getByText('2cb0ce35')).toBeInTheDocument();
    // Null author falls back to the em dash.
    expect(screen.getByText('—')).toBeInTheDocument();
    // Count badge shows "2 en attente".
    expect(screen.getByText(/2 en attente/i)).toBeInTheDocument();
    // Action button appears for each row (disabled placeholder).
    expect(screen.getAllByRole('button', { name: /Voir détail/i })).toHaveLength(2);
  });

  it('renders the i18n title across FR / EN / AR (parity guard)', async () => {
    const expected = {
      fr: 'Règles en revue 4-yeux',
      en: 'Rules pending 4-eyes review',
      ar: 'القواعد قيد مراجعة الأربعة أعين',
    } as const;
    for (const lang of LANGUAGES) {
      await i18n.changeLanguage(lang);
      fetchApiMock.mockResolvedValueOnce({
        data: [],
        meta: { ts: '', version: '1' },
      });
      const { unmount } = renderPanel();
      await waitFor(() => {
        expect(screen.getByText(expected[lang])).toBeInTheDocument();
      });
      unmount();
    }
  });
});
