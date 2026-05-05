import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConfidenceBadge } from './ConfidenceBadge';

describe('<ConfidenceBadge> — E', () => {
  it('renders with the level-driven CSS class and the supplied label', () => {
    render(<ConfidenceBadge level="high" label="Confiance élevée · 98%" />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('conf--high');
    expect(badge.className).toContain('conf');
    expect(badge.getAttribute('data-level')).toBe('high');
    expect(badge.textContent).toContain('Confiance élevée · 98%');
  });

  it('renders the dot by default and hides it when dot=false', () => {
    const { rerender } = render(<ConfidenceBadge level="medium" label="Probable · 82%" />);
    expect(screen.getByTestId('confidence-badge').querySelector('.conf__dot')).toBeTruthy();
    rerender(<ConfidenceBadge level="medium" label="Probable · 82%" dot={false} />);
    expect(screen.getByTestId('confidence-badge').querySelector('.conf__dot')).toBeNull();
  });

  it('exposes role="status" + aria-label for screen readers', () => {
    render(<ConfidenceBadge level="low" label="Faible · 30%" />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge.getAttribute('role')).toBe('status');
    expect(badge.getAttribute('aria-label')).toBe('Faible · 30%');
  });

  it('accepts every documented level (high / medium / low) without branching', () => {
    const levels = ['high', 'medium', 'low'] as const;
    for (const level of levels) {
      const { unmount } = render(<ConfidenceBadge level={level} label={`L=${level}`} />);
      expect(screen.getByTestId('confidence-badge').className).toContain(`conf--${level}`);
      unmount();
    }
  });
});
