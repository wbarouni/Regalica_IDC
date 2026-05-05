import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Artefact — generic typed wrapper for any conversational artefact
 * rendered inside the Workspace thread (Synthèse, Livrables A/B/C,
 * Briefing, Notification, System trace, ...).
 *
 * Doctrine:
 *   1. Type drives the CSS class (`artefact--${type}`) — never an
 *      `if/elif` ladder inside the component.
 *   2. Badge label is read from i18n (`artefact.badge.${type}` by
 *      default, overrideable via `badgeKey` for one-off cases).
 *      Never a hardcoded string.
 *   3. State drives the layout via the `data-state` attribute and
 *      primitives.css selectors only — the component does not branch
 *      on state for rendering.
 *   4. Toggle is local — clicking the header flips
 *      collapsed <-> expanded; standard stays standard.
 */

export type ArtefactType =
  | 'synthese'
  | 'livrable_a'
  | 'livrable_b'
  | 'livrable_c'
  | 'briefing'
  | 'notification'
  | 'system';

export type ArtefactState = 'expanded' | 'standard' | 'collapsed';

export interface ArtefactProps {
  type: ArtefactType;
  state?: ArtefactState;
  /**
   * When provided, drives the visible state from outside the component
   * (controlled mode). User clicks still call onToggle, which the parent
   * decides how to honour. Falls back to internal state when omitted.
   */
  controlledState?: ArtefactState;
  onToggle?: () => void;
  runId?: string;
  badgeKey?: string;
  children: ReactNode;
}

function nextState(current: ArtefactState): ArtefactState {
  if (current === 'collapsed') {
    return 'expanded';
  }
  if (current === 'expanded') {
    return 'collapsed';
  }
  return current;
}

export function Artefact({
  type,
  state: initialState = 'standard',
  controlledState,
  onToggle,
  runId,
  badgeKey,
  children,
}: ArtefactProps): JSX.Element {
  const { t } = useTranslation();
  const [internalState, setInternalState] = useState<ArtefactState>(initialState);
  const userOverrodeRef = useRef<boolean>(false);

  // Controlled mode: external state wins until the user clicks once,
  // after which their choice is preserved (avoids the parent stealing
  // the artefact open/closed away from the reader).
  const state =
    controlledState !== undefined && !userOverrodeRef.current ? controlledState : internalState;

  // Keep internal state aligned with controlled state until the user
  // takes manual control. This means an external transition from
  // "expanded" to "collapsed" updates the displayed state seamlessly.
  useEffect(() => {
    if (controlledState !== undefined && !userOverrodeRef.current) {
      setInternalState(controlledState);
    }
  }, [controlledState]);

  const toggle = useCallback(() => {
    userOverrodeRef.current = true;
    setInternalState(nextState);
    onToggle?.();
  }, [onToggle]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const resolvedBadgeKey = badgeKey ?? `artefact.badge.${type}`;

  return (
    <article className={`artefact artefact--${type}`} data-state={state} data-run-id={runId}>
      <header
        className="artefact__header"
        role="button"
        tabIndex={0}
        aria-expanded={state === 'expanded'}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span className={`artefact__badge artefact__badge--${type}`}>{t(resolvedBadgeKey)}</span>
      </header>
      <div className="artefact__body">{children}</div>
    </article>
  );
}
