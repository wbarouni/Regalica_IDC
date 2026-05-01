import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuestionType } from '../types/api';

import { SuggestionChips } from './SuggestionChips';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const useSuggestionsMock = vi.fn<
  (runId: string | null) => {
    suggestions: QuestionType[];
    loading: boolean;
    error: string | null;
  }
>();

vi.mock('../hooks/useSuggestions', () => ({
  useSuggestions: (runId: string | null) => useSuggestionsMock(runId),
}));

const SEVEN: QuestionType[] = [
  { id: 'a', fnName: 'zoom', labelI18nKey: 'chip.zoom', ordinal: 1 },
  { id: 'b', fnName: 'cluster', labelI18nKey: 'chip.cluster', ordinal: 2 },
  { id: 'c', fnName: 'historical', labelI18nKey: 'chip.historical', ordinal: 3 },
  { id: 'd', fnName: 'citation', labelI18nKey: 'chip.citation', ordinal: 4 },
  { id: 'e', fnName: 'simulation', labelI18nKey: 'chip.simulation', ordinal: 5 },
  { id: 'f', fnName: 'sanction', labelI18nKey: 'chip.sanction', ordinal: 6 },
  { id: 'g', fnName: 'plan', labelI18nKey: 'chip.plan', ordinal: 7 },
];

beforeEach(() => {
  useSuggestionsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('<SuggestionChips>', () => {
  it('renders nothing when suggestions is empty', () => {
    useSuggestionsMock.mockReturnValue({ suggestions: [], loading: false, error: null });
    const { container } = render(<SuggestionChips runId={null} onSelect={() => {}} />);
    expect(container.querySelector('.dock__suggestions')).toBeNull();
  });

  it('renders one .dock__sug per suggestion', () => {
    useSuggestionsMock.mockReturnValue({ suggestions: SEVEN, loading: false, error: null });
    const { container } = render(<SuggestionChips runId={null} onSelect={() => {}} />);
    const chips = container.querySelectorAll('.dock__sug');
    expect(chips).toHaveLength(7);
  });

  it('numbers chips T1..TN from the array index', () => {
    useSuggestionsMock.mockReturnValue({ suggestions: SEVEN, loading: false, error: null });
    const { container } = render(<SuggestionChips runId={null} onSelect={() => {}} />);
    const icons = container.querySelectorAll('.dock__sug-icon');
    expect(Array.from(icons).map((n) => n.textContent)).toEqual([
      'T1',
      'T2',
      'T3',
      'T4',
      'T5',
      'T6',
      'T7',
    ]);
  });

  it('renders the i18n key text for each chip label', () => {
    useSuggestionsMock.mockReturnValue({
      suggestions: SEVEN.slice(0, 3),
      loading: false,
      error: null,
    });
    render(<SuggestionChips runId={null} onSelect={() => {}} />);
    expect(screen.getByText('chip.zoom')).toBeInTheDocument();
    expect(screen.getByText('chip.cluster')).toBeInTheDocument();
    expect(screen.getByText('chip.historical')).toBeInTheDocument();
  });

  it('exposes fnName via data-fn-name on each button', () => {
    useSuggestionsMock.mockReturnValue({
      suggestions: SEVEN.slice(0, 2),
      loading: false,
      error: null,
    });
    const { container } = render(<SuggestionChips runId={null} onSelect={() => {}} />);
    const fnNames = Array.from(container.querySelectorAll('.dock__sug')).map((b) =>
      b.getAttribute('data-fn-name'),
    );
    expect(fnNames).toEqual(['zoom', 'cluster']);
  });

  it('invokes onSelect with the chip fnName on click', () => {
    useSuggestionsMock.mockReturnValue({
      suggestions: SEVEN.slice(0, 1),
      loading: false,
      error: null,
    });
    const onSelect = vi.fn();
    const { container } = render(<SuggestionChips runId={null} onSelect={onSelect} />);
    fireEvent.click(container.querySelector('.dock__sug')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('zoom');
  });

  it('forwards the runId to the hook', () => {
    useSuggestionsMock.mockReturnValue({ suggestions: [], loading: false, error: null });
    const runId = '00000000-0000-7000-8000-0000000000ff';
    render(<SuggestionChips runId={runId} onSelect={() => {}} />);
    expect(useSuggestionsMock).toHaveBeenCalledWith(runId);
  });

  it('disables every chip when disabled=true', () => {
    useSuggestionsMock.mockReturnValue({
      suggestions: SEVEN.slice(0, 3),
      loading: false,
      error: null,
    });
    const onSelect = vi.fn();
    const { container } = render(
      <SuggestionChips runId={null} onSelect={onSelect} disabled={true} />,
    );
    const chips = Array.from(container.querySelectorAll('.dock__sug')) as HTMLButtonElement[];
    expect(chips.every((c) => c.disabled)).toBe(true);
    fireEvent.click(chips[0]!);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
