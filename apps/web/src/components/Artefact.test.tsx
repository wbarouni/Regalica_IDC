import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Artefact, type ArtefactType } from './Artefact';

vi.mock('react-i18next', () => ({
  // Stubs the t() function so test assertions can match the i18n key
  // verbatim. The real i18next instance is initialised in main.tsx and
  // is out of scope for unit tests of presentational components.
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const ALL_TYPES: ArtefactType[] = [
  'synthese',
  'livrable_a',
  'livrable_b',
  'livrable_c',
  'briefing',
  'notification',
  'system',
];

describe('<Artefact>', () => {
  it.each(ALL_TYPES)('renders the artefact--%s class for type=%s', (type) => {
    const { container } = render(
      <Artefact type={type}>
        <p>body</p>
      </Artefact>,
    );
    const article = container.querySelector('article.artefact');
    expect(article).not.toBeNull();
    expect(article!.classList.contains(`artefact--${type}`)).toBe(true);
  });

  it.each(ALL_TYPES)(
    'renders badge text from the i18n key artefact.badge.%s by default',
    (type) => {
      render(
        <Artefact type={type}>
          <p>body</p>
        </Artefact>,
      );
      expect(screen.getByText(`artefact.badge.${type}`)).toBeInTheDocument();
    },
  );

  it('uses the badgeKey override when provided', () => {
    render(
      <Artefact type="system" badgeKey="chat.thinking">
        <p>body</p>
      </Artefact>,
    );
    expect(screen.getByText('chat.thinking')).toBeInTheDocument();
    expect(screen.queryByText('artefact.badge.system')).not.toBeInTheDocument();
  });

  it('starts in the standard data-state by default', () => {
    const { container } = render(
      <Artefact type="synthese">
        <p>body</p>
      </Artefact>,
    );
    const article = container.querySelector('article.artefact');
    expect(article!.getAttribute('data-state')).toBe('standard');
    expect(article!.querySelector('.artefact__header')!.getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('respects the initial state prop', () => {
    const { container } = render(
      <Artefact type="system" state="collapsed">
        <p>body</p>
      </Artefact>,
    );
    expect(container.querySelector('article')!.getAttribute('data-state')).toBe('collapsed');
  });

  it('toggles collapsed -> expanded on header click', () => {
    const { container } = render(
      <Artefact type="system" state="collapsed">
        <p>body</p>
      </Artefact>,
    );
    const article = container.querySelector('article')!;
    const header = container.querySelector('.artefact__header')!;
    expect(article.getAttribute('data-state')).toBe('collapsed');
    fireEvent.click(header);
    expect(article.getAttribute('data-state')).toBe('expanded');
    fireEvent.click(header);
    expect(article.getAttribute('data-state')).toBe('collapsed');
  });

  it('keeps the standard state when toggled', () => {
    // standard is a layout-only state (full-width header + body always
    // visible). Clicking the header is a no-op so callers do not
    // accidentally collapse a piece they meant to keep open.
    const { container } = render(
      <Artefact type="briefing" state="standard">
        <p>body</p>
      </Artefact>,
    );
    const article = container.querySelector('article')!;
    const header = container.querySelector('.artefact__header')!;
    fireEvent.click(header);
    expect(article.getAttribute('data-state')).toBe('standard');
  });

  it('toggles via keyboard (Enter and Space)', () => {
    const { container } = render(
      <Artefact type="livrable_c" state="collapsed">
        <p>body</p>
      </Artefact>,
    );
    const article = container.querySelector('article')!;
    const header = container.querySelector('.artefact__header')!;
    fireEvent.keyDown(header, { key: 'Enter' });
    expect(article.getAttribute('data-state')).toBe('expanded');
    fireEvent.keyDown(header, { key: ' ' });
    expect(article.getAttribute('data-state')).toBe('collapsed');
  });

  it('exposes the runId via data-run-id when provided', () => {
    const runId = '00000000-0000-7000-8000-000000000010';
    const { container } = render(
      <Artefact type="notification" runId={runId}>
        <p>body</p>
      </Artefact>,
    );
    expect(container.querySelector('article')!.getAttribute('data-run-id')).toBe(runId);
  });

  it('renders the badge tone modifier artefact__badge--<type>', () => {
    const { container } = render(
      <Artefact type="livrable_c">
        <p>body</p>
      </Artefact>,
    );
    const badge = container.querySelector('.artefact__badge');
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains('artefact__badge--livrable_c')).toBe(true);
  });

  it('renders children inside the body slot', () => {
    render(
      <Artefact type="briefing">
        <span data-testid="body-marker">payload</span>
      </Artefact>,
    );
    const marker = screen.getByTestId('body-marker');
    expect(marker.textContent).toBe('payload');
    expect(marker.closest('.artefact__body')).not.toBeNull();
  });
});
