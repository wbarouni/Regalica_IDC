import { useProgress } from '../hooks/useProgress';

/**
 * K4 — minimal 1px-tall progress bar that animates while the engine
 * is evaluating. Stays mounted under the workspace Ribbon and is
 * conditionally rendered by the parent only while
 * `run.status === 'running'` (parent contract — this component
 * does not branch on status to keep its render path side-effect free).
 *
 * Visual: 1px height, marigold fill on stone-100 track, 200ms ease
 * width transition. RTL-safe via inset-inline-end (handled by the
 * 100% wrapper).
 */
export interface ProgressBarProps {
  runId: string | null;
}

export function ProgressBar({ runId }: ProgressBarProps): JSX.Element | null {
  const { progress } = useProgress(runId);

  // Hidden until the engine emits its first progress frame. Keeps
  // the layout from jumping when the run hasn't started or after
  // the run has flipped out of 'running' (parent unmounts then).
  if (progress === null) {
    return null;
  }

  const pct = Math.max(0, Math.min(100, progress.pctComplete));

  return (
    <div
      data-testid="progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`${String(pct)}%`}
      style={{
        width: '100%',
        height: '1px',
        background: 'var(--stone-100)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${String(pct)}%`,
          background: 'var(--marigold)',
          transition: 'width 200ms ease',
        }}
      />
    </div>
  );
}
