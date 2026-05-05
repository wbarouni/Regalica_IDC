/**
 * E — ConfidenceBadge.
 *
 * Edition One signature pill used across every artefact in the
 * workspace v5 mockup (`docs/mockups/regalica-workspace-v5.html`)
 * — 12 occurrences with `.conf--high|medium|low` variants:
 *
 *   - `confConfirmed 98%` (briefing M3)
 *   - `synthReady` (synthèse M4)
 *   - `thinkConf 94%` (thinking M5)
 *   - `confHigh 94%` (livrable C M6)
 *   - `confProbable 82%` (investigation)
 *   - `sentConf 99%` (sentinelle D pédago)
 *   - `diffConf` (diff N-1)
 *   - `ovSimConf 99%` / `ovSancConf 85%` / `ovPlanConf 92%` (overlays)
 *
 * The CSS primitives (`apps/web/src/styles/primitives.css:955-980`)
 * have been in place since the v5 stylesheet landed (commit 0668438)
 * but had no React consumer. E lights them up.
 *
 * Doctrine:
 *   1. `level` is the structural prop (`high|medium|low`); the dot
 *      colour and text colour are CSS-driven via `.conf--${level}`.
 *      The component never branches on level for styling — primitives.css
 *      owns the look-and-feel (CLAUDE.md §11 zero-hardcoding for design
 *      tokens).
 *   2. `label` is the user-facing text — supplied by the caller, NOT
 *      resolved internally. Callers pass `t('thinking.conf')` or
 *      similar so the i18n surface stays under their control. This
 *      keeps the component reusable across artefacts that each carry
 *      their own confidence narrative.
 *   3. `dot` defaults to true; pass false to render label-only when
 *      the badge sits inside a tighter container.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  label: string;
  dot?: boolean;
}

export function ConfidenceBadge({ level, label, dot = true }: ConfidenceBadgeProps): JSX.Element {
  return (
    <span
      className={`conf conf--${level}`}
      role="status"
      aria-label={label}
      data-testid="confidence-badge"
      data-level={level}
    >
      {dot && <span className="conf__dot" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}
