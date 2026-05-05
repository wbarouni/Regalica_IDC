import { useEffect, useRef, useState } from 'react';

/**
 * useTypewriter — animate the reveal of a thinking trace then a
 * response payload word-by-word, to give the perception of streaming
 * even though chatbot-py returns the full ChatResponse synchronously.
 *
 * Phases:
 *   1. "thinking"  → reveal `thinkingText` token-by-token
 *   2. "response"  → reveal `responseText` token-by-token
 *   3. "done"      → both texts fully revealed
 *
 * When `enabled` is false (e.g., a historical message that mounted
 * before the user sent anything in this session), both texts are
 * surfaced fully on first render and `phase` lands directly on "done".
 *
 * Tokenization is whitespace-preserving via `text.split(/(\s+)/)` so
 * that the rendered output is bit-identical to the source once the
 * animation completes.
 */

const THINKING_INTERVAL_MS = 22;
const RESPONSE_INTERVAL_MS = 18;

export type TypewriterPhase = 'thinking' | 'response' | 'done';

interface UseTypewriterParams {
  thinkingText: string;
  responseText: string;
  enabled: boolean;
}

interface UseTypewriterResult {
  revealedThinking: string;
  revealedResponse: string;
  phase: TypewriterPhase;
}

export function useTypewriter({
  thinkingText,
  responseText,
  enabled,
}: UseTypewriterParams): UseTypewriterResult {
  const [revealedThinking, setRevealedThinking] = useState<string>(enabled ? '' : thinkingText);
  const [revealedResponse, setRevealedResponse] = useState<string>(enabled ? '' : responseText);
  const [phase, setPhase] = useState<TypewriterPhase>(enabled ? 'thinking' : 'done');
  const cancelledRef = useRef<boolean>(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) {
      setRevealedThinking(thinkingText);
      setRevealedResponse(responseText);
      setPhase('done');
      return () => {
        cancelledRef.current = true;
      };
    }

    const thinkingTokens = thinkingText.length > 0 ? thinkingText.split(/(\s+)/) : [];
    const responseTokens = responseText.length > 0 ? responseText.split(/(\s+)/) : [];

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const startResponse = (): void => {
      if (cancelledRef.current) return;
      setPhase('response');
      if (responseTokens.length === 0) {
        setPhase('done');
        return;
      }
      let j = 0;
      const stepResponse = (): void => {
        if (cancelledRef.current) return;
        j += 1;
        setRevealedResponse(responseTokens.slice(0, j).join(''));
        if (j >= responseTokens.length) {
          setPhase('done');
          return;
        }
        timeoutId = setTimeout(stepResponse, RESPONSE_INTERVAL_MS);
      };
      stepResponse();
    };

    if (thinkingTokens.length === 0) {
      startResponse();
    } else {
      let i = 0;
      const stepThinking = (): void => {
        if (cancelledRef.current) return;
        i += 1;
        setRevealedThinking(thinkingTokens.slice(0, i).join(''));
        if (i >= thinkingTokens.length) {
          startResponse();
          return;
        }
        timeoutId = setTimeout(stepThinking, THINKING_INTERVAL_MS);
      };
      stepThinking();
    }

    return () => {
      cancelledRef.current = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
    // We intentionally start the animation once per (thinkingText,
    // responseText, enabled) triple. React re-runs the effect if any
    // of these change.
  }, [thinkingText, responseText, enabled]);

  return { revealedThinking, revealedResponse, phase };
}
