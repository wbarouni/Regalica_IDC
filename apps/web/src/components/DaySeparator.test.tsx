import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DaySeparator } from './DaySeparator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Mirror the date back so assertions can match the formatted
    // string verbatim — same passthrough strategy as Artefact tests.
    t: (key: string, opts?: { date?: string }) => `${key}|${opts?.date ?? ''}`,
    i18n: { language: 'fr-FR' },
  }),
}));

describe('<DaySeparator>', () => {
  it('renders the .thread__day separator wrapper', () => {
    const { container } = render(<DaySeparator date={new Date('2026-04-30T10:00:00Z')} />);
    const sep = container.querySelector('.thread__day');
    expect(sep).not.toBeNull();
    expect(sep!.getAttribute('role')).toBe('separator');
  });

  it('renders the two .thread__day-line hairlines and one label', () => {
    const { container } = render(<DaySeparator date={new Date('2026-04-30T10:00:00Z')} />);
    expect(container.querySelectorAll('.thread__day-line').length).toBe(2);
    expect(container.querySelectorAll('.thread__day-label').length).toBe(1);
  });

  it('passes the locale-formatted date through the i18n key', () => {
    const date = new Date('2026-04-30T10:00:00Z');
    const expected = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
    const { container } = render(<DaySeparator date={date} />);
    const label = container.querySelector('.thread__day-label')!;
    expect(label.textContent).toBe(`date.dayLabel|${expected}`);
  });

  it('exposes the ISO timestamp on a data attribute for debugging', () => {
    const date = new Date('2026-04-30T10:00:00Z');
    const { container } = render(<DaySeparator date={date} />);
    expect(container.querySelector('.thread__day')!.getAttribute('data-iso')).toBe(
      date.toISOString(),
    );
  });

  it('hides the hairlines from assistive tech via aria-hidden', () => {
    const { container } = render(<DaySeparator date={new Date('2026-04-30T10:00:00Z')} />);
    const lines = container.querySelectorAll('.thread__day-line');
    for (const line of lines) {
      expect(line.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
