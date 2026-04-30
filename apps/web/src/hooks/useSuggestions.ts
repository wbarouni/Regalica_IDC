import { useEffect, useState } from 'react';

import { TENANT_ID } from '../lib/config';
import { ApiConfigError, ApiFetchError, fetchApi } from '../lib/fetchApi';
import type { QuestionType } from '../types/api';

interface SuggestionsResponse {
  suggestions: QuestionType[];
}

export interface UseSuggestionsResult {
  suggestions: QuestionType[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches the active T2 question types from
 * GET /api/tenants/:tenantId/prompts/suggestions[?runId=…].
 *
 * The optional runId is forwarded so Phase 3 can narrow chips by
 * the run's actual FAIL profile; for Phase B the backend always
 * returns the full active list.
 *
 * Returns the array sorted by ordinal so the consumer
 * (SuggestionChips) can render T1..TN without resorting locally.
 */
export function useSuggestions(runId: string | null): UseSuggestionsResult {
  const [suggestions, setSuggestions] = useState<QuestionType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (TENANT_ID === undefined || TENANT_ID === '') {
      setError('MISSING_TENANT_ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const path =
      runId !== null
        ? `/api/tenants/${TENANT_ID}/prompts/suggestions?runId=${encodeURIComponent(runId)}`
        : `/api/tenants/${TENANT_ID}/prompts/suggestions`;

    void fetchApi<SuggestionsResponse>(path)
      .then((r) => {
        if (cancelled) {
          return;
        }
        const sorted = [...r.data.suggestions].sort((a, b) => a.ordinal - b.ordinal);
        setSuggestions(sorted);
      })
      .catch((e: unknown) => {
        if (cancelled) {
          return;
        }
        if (e instanceof ApiFetchError || e instanceof ApiConfigError) {
          setError(e.code);
        } else {
          setError('UNKNOWN');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [runId]);

  return { suggestions, loading, error };
}
