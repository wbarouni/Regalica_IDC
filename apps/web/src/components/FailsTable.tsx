import { useTranslation } from 'react-i18next';

import { useFails, type FailFilter } from '../hooks/useFails';

/**
 * FailsTable — render the validation_fail_details rows persisted by
 * /finalize, paginated and filtered.
 *
 * Mounted by Workspace.tsx when `summary.run.status === 'completed'`
 * AND there is at least one fail to show. Reads via `useFails`, which
 * fetches `GET /api/tenants/:tenantId/runs/:runId/fails?filter=all&page=N`.
 *
 * Tranche 0.5 W2.2 — surface what /finalize wrote so the user actually
 * sees the verdict instead of an empty page after the run completes.
 *
 * Visual: minimal HTML table, mono font, tight padding. Severity is
 * rendered as a colored badge (severe = vermilion, rounding = ochre).
 * No tooltips / no inline expand for Tranche 0.5 — Tranche 1+ adds
 * the cluster grouping, citation popovers, and the "explain this fail"
 * Investigator dock.
 */
export interface FailsTableProps {
  runId: string;
  filter?: FailFilter;
}

export function FailsTable({ runId, filter = 'all' }: FailsTableProps): JSX.Element {
  const { t } = useTranslation();
  const { fails, loading, error, total, page, setPage } = useFails(runId, filter);

  if (loading && fails.length === 0) {
    return (
      <div className="text-xs font-mono text-stone-500" role="status">
        {t('fails.loading', { defaultValue: 'Loading fails…' })}
      </div>
    );
  }
  if (error !== null) {
    return (
      <div className="text-xs font-mono text-vermilion-700" role="alert">
        {t('fails.error', { defaultValue: 'Failed to load fails' })}: {error}
      </div>
    );
  }
  if (fails.length === 0) {
    return (
      <div
        className="rounded border border-evergreen-200 bg-evergreen-50 px-3 py-2 text-sm font-mono text-evergreen-800"
        role="status"
      >
        {t('fails.empty', { defaultValue: 'No fails to display.' })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">
        {t('fails.title', { defaultValue: 'Fails' })} ({total})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono border-collapse">
          <thead>
            <tr className="border-b border-stone-300 text-left text-[10px] uppercase tracking-wider text-stone-600">
              <th className="px-2 py-1">{t('fails.col.annexe', { defaultValue: 'Annexe' })}</th>
              <th className="px-2 py-1">{t('fails.col.rule', { defaultValue: 'Règle' })}</th>
              <th className="px-2 py-1">{t('fails.col.severity', { defaultValue: 'Sévérité' })}</th>
              <th className="px-2 py-1 text-right">
                {t('fails.col.gap', { defaultValue: 'Écart' })}
              </th>
              <th className="px-2 py-1 text-right">
                {t('fails.col.gapRel', { defaultValue: 'Écart %' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {fails.map((f) => (
              <tr key={f.id} className="border-b border-stone-200 last:border-0 hover:bg-stone-50">
                <td className="px-2 py-1.5">{f.ax_term}</td>
                <td className="px-2 py-1.5">{f.num_regle}</td>
                <td className="px-2 py-1.5">
                  <SeverityBadge severity={f.severity} />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {f.gap_absolute !== null ? Number(f.gap_absolute).toLocaleString('fr-FR') : '—'}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {f.gap_relative !== null ? `${(Number(f.gap_relative) * 100).toFixed(2)} %` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > fails.length && (
        <Pagination
          page={page}
          total={total}
          pageSize={fails.length}
          onPrev={() => setPage(Math.max(1, page - 1))}
          onNext={() => setPage(page + 1)}
        />
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: 'severe' | 'rounding' }): JSX.Element {
  const styles =
    severity === 'severe'
      ? 'bg-vermilion-100 text-vermilion-800 border-vermilion-300'
      : 'bg-ochre-100 text-ochre-800 border-ochre-300';
  const label = severity === 'severe' ? 'Sévère' : 'Arrondi';
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${styles}`}
    >
      {label}
    </span>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onPrev,
  onNext,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}): JSX.Element {
  const showingTo = Math.min(page * pageSize, total);
  const showingFrom = (page - 1) * pageSize + 1;
  return (
    <div className="flex justify-between items-center text-xs font-mono text-stone-600">
      <span>
        {showingFrom}–{showingTo} / {total}
      </span>
      <span className="space-x-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page === 1}
          className="border border-stone-300 rounded px-2 py-0.5 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ←
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={showingTo >= total}
          className="border border-stone-300 rounded px-2 py-0.5 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          →
        </button>
      </span>
    </div>
  );
}
