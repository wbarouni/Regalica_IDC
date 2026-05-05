import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useTypewriter } from './useTypewriter';

describe('useTypewriter — Point 2C streaming illusion', () => {
  it('reveals both texts immediately when disabled (historical messages)', () => {
    const { result } = renderHook(() =>
      useTypewriter({
        thinkingText: 'phase 1\nphase 2',
        responseText: 'Bonjour, je suis Regalica.',
        enabled: false,
      }),
    );
    expect(result.current.phase).toBe('done');
    expect(result.current.revealedThinking).toBe('phase 1\nphase 2');
    expect(result.current.revealedResponse).toBe('Bonjour, je suis Regalica.');
  });

  it('streams thinking first, then response, landing on identical full strings', async () => {
    const thinkingText = 'un deux trois';
    const responseText = 'alpha beta gamma';
    const { result } = renderHook(() =>
      useTypewriter({ thinkingText, responseText, enabled: true }),
    );

    // The animation is mid-flight; first phase is 'thinking' and the
    // response buffer is still empty.
    expect(result.current.phase).toBe('thinking');
    expect(result.current.revealedResponse).toBe('');

    await waitFor(() => expect(result.current.phase).toBe('done'), { timeout: 5000 });
    expect(result.current.revealedThinking).toBe(thinkingText);
    expect(result.current.revealedResponse).toBe(responseText);
  });

  it('skips the thinking phase when thinkingText is empty', async () => {
    const { result } = renderHook(() =>
      useTypewriter({ thinkingText: '', responseText: 'hello world', enabled: true }),
    );
    await waitFor(() => expect(result.current.phase).toBe('done'), { timeout: 5000 });
    expect(result.current.revealedResponse).toBe('hello world');
  });
});
