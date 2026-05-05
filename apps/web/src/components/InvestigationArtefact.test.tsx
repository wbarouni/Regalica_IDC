import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import i18n from '../lib/i18n';
import type { FailDetail } from '../types/api';

import { InvestigationArtefact } from './InvestigationArtefact';

beforeAll(async () => {
  await i18n.loadLanguages(['fr', 'en', 'ar']);
});

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

function makeFail(over: Partial<FailDetail> = {}): FailDetail {
  return {
    id: '00000000-0000-7000-8000-0000000000fa',
    ax_term: '630',
    num_regle: 266,
    operateur: '=',
    regle_label: 'Test rule',
    severity: 'severe',
    expected_value: 57985.238,
    computed_value: 58028.376,
    gap_absolute: 43.138,
    gap_relative: 0.000744,
    cluster_id: null,
    is_sentinel_iteration: false,
    iteration_index: null,
    created_at: '2026-04-30T11:36:00Z',
    ...over,
  };
}

function renderWithI18n(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('<InvestigationArtefact> — C', () => {
  it('renders the artefact frame with title carrying the rule address', () => {
    renderWithI18n(<InvestigationArtefact fail={makeFail()} />);
    const article = screen.getByTestId('investigation-artefact');
    expect(article).toBeInTheDocument();
    expect(article.className).toContain('artefact--livrable_c');
    expect(article.textContent).toContain('Investigation');
    expect(article.textContent).toContain('630/266');
  });

  it('renders the .decomp table with R1 (RHS) and R2 (LHS) rows', () => {
    const { container } = renderWithI18n(<InvestigationArtefact fail={makeFail()} />);
    const decomp = container.querySelector('.decomp');
    expect(decomp).not.toBeNull();
    const rangs = container.querySelectorAll('.decomp__rang');
    expect(rangs.length).toBe(2);
    expect(rangs[0]?.textContent).toBe('R1');
    expect(rangs[1]?.textContent).toBe('R2');
    // Banking format on R1/R2 values. Intl.NumberFormat('fr-FR') uses
    // a narrow no-break space (U+202F) for thousands; normalize all
    // whitespace to a regular space before asserting.
    const flat = (decomp?.textContent ?? '').replace(/\s/g, ' ');
    expect(flat).toContain('57 985,238');
    expect(flat).toContain('58 028,376');
  });

  it('renders the .calc-block with banking-format gap and severity coloring', () => {
    const { container } = renderWithI18n(<InvestigationArtefact fail={makeFail()} />);
    const calc = container.querySelector('.calc-block');
    expect(calc).not.toBeNull();
    expect((calc?.textContent ?? '').replace(/\s/g, ' ')).toContain('43,138');
    // Severity = 'severe' → at least one .c-fail span on R2 + Δ.
    const fails = container.querySelectorAll('.c-fail');
    expect(fails.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the .inspector aside with severity, operator, and gap proof', () => {
    const { container } = renderWithI18n(<InvestigationArtefact fail={makeFail()} />);
    const inspector = container.querySelector('.inspector');
    expect(inspector).not.toBeNull();
    expect(inspector?.textContent).toContain('Sévère');
    expect(inspector?.textContent).toContain('=');
    expect((inspector?.textContent ?? '').replace(/\s/g, ' ')).toContain('43,138');
  });

  it('confidence badge level depends on severity (severe → low, rounding → medium)', () => {
    const { container, unmount } = renderWithI18n(
      <InvestigationArtefact fail={makeFail({ severity: 'severe' })} />,
    );
    expect(
      container.querySelector('[data-testid="confidence-badge"]')?.getAttribute('data-level'),
    ).toBe('low');
    unmount();

    const { container: c2 } = renderWithI18n(
      <InvestigationArtefact fail={makeFail({ severity: 'rounding' })} />,
    );
    expect(c2.querySelector('[data-testid="confidence-badge"]')?.getAttribute('data-level')).toBe(
      'medium',
    );
  });

  it('renders cleanly in EN and AR locales (parity guard)', async () => {
    await i18n.changeLanguage('en');
    const { unmount } = renderWithI18n(<InvestigationArtefact fail={makeFail()} />);
    expect(screen.getByTestId('investigation-artefact').textContent).toMatch(/Investigation/);
    expect(screen.getByTestId('investigation-artefact').textContent).toMatch(/RDG decomposition/);
    unmount();

    await i18n.changeLanguage('ar');
    const { container } = renderWithI18n(<InvestigationArtefact fail={makeFail()} />);
    const article = container.querySelector('[data-testid="investigation-artefact"]');
    expect(article?.textContent).toContain('تحقيق');
  });
});
