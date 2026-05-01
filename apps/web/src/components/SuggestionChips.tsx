import { useTranslation } from 'react-i18next';

import { useSuggestions } from '../hooks/useSuggestions';

/**
 * SuggestionChips — renders the .dock__suggestions strip from
 * primitives.css with one .dock__sug per active question_type.
 *
 * Doctrine:
 *   - chip labels resolve through i18n via labelI18nKey from the
 *     server (chip.zoom, chip.cluster, …) — never hardcoded
 *   - numbering (T1..TN) is derived from the array index, not
 *     attached to the row in the DB — adding an 8th type bumps the
 *     UI marker automatically without a client release
 *   - empty list -> render nothing (no hardcoded fallback chip; the
 *     server is the source of truth for what is offered)
 *   - onSelect receives the canonical fnName ("zoom", "cluster", …)
 *     so the consumer can map it to the chatbot routing layer
 *     without parsing the i18n key
 */

export interface SuggestionChipsProps {
  runId: string | null;
  onSelect: (fnName: string) => void;
  disabled?: boolean;
}

export function SuggestionChips({
  runId,
  onSelect,
  disabled = false,
}: SuggestionChipsProps): JSX.Element | null {
  const { t } = useTranslation();
  const { suggestions } = useSuggestions(runId);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="dock__suggestions" role="list">
      {suggestions.map((s, idx) => (
        <button
          key={s.id}
          type="button"
          role="listitem"
          className="dock__sug"
          onClick={() => onSelect(s.fnName)}
          disabled={disabled}
          data-fn-name={s.fnName}
        >
          <span className="dock__sug-icon" aria-hidden="true">
            T{idx + 1}
          </span>
          <span>{t(s.labelI18nKey)}</span>
        </button>
      ))}
    </div>
  );
}
