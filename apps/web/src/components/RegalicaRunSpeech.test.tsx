import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import i18n from '../lib/i18n';
import type { ValidationRun } from '../types/api';

import { RegalicaRunSpeech } from './RegalicaRunSpeech';

beforeAll(async () => {
  await i18n.loadLanguages(['fr', 'en', 'ar']);
});

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

function makeRun(over: Partial<ValidationRun> = {}): ValidationRun {
  return {
    run_id: '00000000-0000-7000-8000-000000000abc',
    batch_label: null,
    primary_annexe_code: '630',
    arrete_date: '2026-02-28',
    status: 'completed',
    conformity_rate: 0.9988,
    total_rules_evaluated: 1245,
    total_pass: 1242,
    total_fail_severe: 2,
    total_fail_rounding: 1,
    execution_time_ms: 3200,
    step1_xsd_status: 'pass',
    step2_embedded_status: 'pass',
    step3_rdg_status: 'pass',
    initiated_at: '2026-04-30T11:32:00Z',
    completed_at: '2026-04-30T11:32:03Z',
    error_code: null,
    correlation_id: null,
    ...over,
  };
}

function renderWithI18n(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('<RegalicaRunSpeech> — B', () => {
  it('returns null when run.status is not completed', () => {
    renderWithI18n(<RegalicaRunSpeech run={makeRun({ status: 'running' })} />);
    expect(screen.queryByTestId('regalica-run-speech')).toBeNull();
  });

  it('renders the conversational frame with banking-format duration + counts', () => {
    renderWithI18n(<RegalicaRunSpeech run={makeRun()} />);
    const frame = screen.getByTestId('regalica-run-speech');
    expect(frame).toBeInTheDocument();
    // Avatar + name
    expect(frame.querySelector('.msg-rega__avatar')).toBeTruthy();
    expect(frame.textContent).toContain('Regalica');
    // Duration: 3200 ms → "3,2 s" (fr-FR)
    expect(frame.textContent).toMatch(/3,2\s*s\b/);
    // Counts: 1245 → "1 245" (fr-FR thin space)
    const flat = (frame.textContent ?? '').replace(/ | /g, ' ');
    expect(flat).toContain('1 245 règles évaluées');
    expect(flat).toContain('2 FAIL sévères');
    expect(flat).toContain('1 arrondis');
  });

  it('derives confidence level from total_fail_severe (high / medium / low)', () => {
    const { unmount: u1 } = renderWithI18n(
      <RegalicaRunSpeech run={makeRun({ total_fail_severe: 0 })} />,
    );
    expect(screen.getByTestId('confidence-badge').getAttribute('data-level')).toBe('high');
    u1();

    const { unmount: u2 } = renderWithI18n(
      <RegalicaRunSpeech run={makeRun({ total_fail_severe: 2 })} />,
    );
    expect(screen.getByTestId('confidence-badge').getAttribute('data-level')).toBe('medium');
    u2();

    const { unmount: u3 } = renderWithI18n(
      <RegalicaRunSpeech run={makeRun({ total_fail_severe: 7 })} />,
    );
    expect(screen.getByTestId('confidence-badge').getAttribute('data-level')).toBe('low');
    u3();
  });

  it('falls back to "Validation terminée" when execution_time_ms is null', () => {
    renderWithI18n(<RegalicaRunSpeech run={makeRun({ execution_time_ms: null })} />);
    const frame = screen.getByTestId('regalica-run-speech');
    expect(frame.textContent).toContain('Validation terminée.');
    expect(frame.textContent).not.toMatch(/\d,\d\s*s/);
  });

  it('renders consistently in EN and AR locales (parity guard)', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<RegalicaRunSpeech run={makeRun()} />);
    let frame = screen.getByTestId('regalica-run-speech');
    expect(frame.textContent).toContain('Validation completed in');

    await i18n.changeLanguage('ar');
    const { container } = renderWithI18n(<RegalicaRunSpeech run={makeRun()} />);
    frame = container.querySelector('[data-testid="regalica-run-speech"]') as HTMLElement;
    expect(frame.textContent).toContain('اكتمل التحقق');
  });

  // Point 1 — children render INSIDE msg-rega__body (not as siblings).
  it('Point 1 — nests children inside msg-rega__body after the confidence badge', () => {
    const { container } = renderWithI18n(
      <RegalicaRunSpeech run={makeRun()}>
        <div data-testid="nested-artefact">artefact body</div>
      </RegalicaRunSpeech>,
    );
    const body = container.querySelector('.msg-rega__body');
    const nested = container.querySelector('[data-testid="nested-artefact"]');
    expect(body).not.toBeNull();
    expect(nested).not.toBeNull();
    // The nested artefact is a descendant of .msg-rega__body, not a
    // sibling of the .msg-rega bubble.
    expect(body?.contains(nested as Node)).toBe(true);
    // The wrapping container has the .msg-rega__artefacts class so a
    // future CSS rule can target it without coupling to children.
    expect(container.querySelector('.msg-rega__artefacts')).not.toBeNull();
  });

  it('Point 1 — does not render the artefacts wrapper when children is undefined', () => {
    const { container } = renderWithI18n(<RegalicaRunSpeech run={makeRun()} />);
    expect(container.querySelector('.msg-rega__artefacts')).toBeNull();
  });
});
