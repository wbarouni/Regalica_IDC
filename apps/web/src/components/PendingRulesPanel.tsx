import { useTranslation } from 'react-i18next';

import { usePendingReviewRules } from '../hooks/usePendingReviewRules';

/**
 * K3 — 4-yeux governance surface for the Library page.
 *
 * Renders the rows returned by GET /api/tenants/:tenantId/rules/
 * pending-review (apps/api/src/routes/library.ts:48). Distinct from
 * the main rules table (which is paginated, status-filtered, lacks
 * author + submission timestamp): this panel is the dedicated
 * compliance-officer view that surfaces the WHO and WHEN of every
 * pending submission so the second pair of eyes can decide.
 *
 * Edition One styling reuses the `.ledger` table primitive +
 * `.f-pill` count badge already in primitives.css. Date format is
 * banking-canonical dd/mm/yyyy via toLocaleDateString with an
 * explicit options bag (defensive against runtime locale).
 *
 * Action column carries a "Voir détail" button placeholder — clicking
 * it currently no-ops; Phase 5 wires the modal into the existing
 * `/rules/:ruleId` route (already orphan-but-prepared on the API).
 */

const RULE_DESCRIPTION_PREVIEW = 80;

function formatBankingDate(iso: string): string {
  // Banking convention dd/mm/yyyy — explicit format (not locale-dep).
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function formatAuthor(authorId: string | null): string {
  if (authorId === null) return '—';
  // Display the first segment of the UUID — keeps the table compact
  // while remaining unambiguous (authors are deterministic UUIDs).
  return authorId.slice(0, 8);
}

export function PendingRulesPanel(): JSX.Element {
  const { t } = useTranslation();
  const { rules, loading, error } = usePendingReviewRules();

  return (
    <section
      data-testid="pending-rules-panel"
      style={{
        marginBottom: '20px',
        border: '1px solid var(--stone-200)',
        background: 'var(--paperPure)',
      }}
    >
      <header
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--stone-100)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <span className="section-label" style={{ fontSize: '11px', letterSpacing: '0.14em' }}>
          {t('lib.pending_review.title')}
        </span>
        {rules.length > 0 && (
          <span className="f-pill__count" style={{ marginInlineStart: 0 }}>
            {t('lib.pending_review.countLabel', { count: rules.length })}
          </span>
        )}
      </header>

      {loading && (
        <div
          style={{
            padding: '16px',
            textAlign: 'center',
            color: 'var(--stone-500)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          }}
        >
          {t('lib.pending_review.loading')}
        </div>
      )}

      {!loading && error !== null && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            color: 'var(--vermilion-700)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {t('lib.pending_review.error')}
        </div>
      )}

      {!loading && error === null && rules.length === 0 && (
        <div
          style={{
            padding: '20px',
            textAlign: 'center',
            color: 'var(--stone-500)',
            fontSize: '13px',
          }}
        >
          {t('lib.pending_review.empty')}
        </div>
      )}

      {!loading && error === null && rules.length > 0 && (
        <div className="ledger-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>{t('lib.pending_review.colRule')}</th>
                <th>{t('lib.pending_review.colDescription')}</th>
                <th>{t('lib.pending_review.colAuthor')}</th>
                <th>{t('lib.pending_review.colSubmitted')}</th>
                <th>{t('lib.pending_review.colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const labelTrim = rule.natural_language.slice(0, RULE_DESCRIPTION_PREVIEW);
                const labelEllipsis =
                  rule.natural_language.length > RULE_DESCRIPTION_PREVIEW ? '…' : '';
                return (
                  <tr key={rule.id}>
                    <td>
                      <span className="mono">
                        {rule.ax_term}/{rule.num_regle}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--stone-800)' }}>
                      {labelTrim}
                      {labelEllipsis}
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '11px' }}>
                        {formatAuthor(rule.author_user_id)}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '11px' }}>
                        {formatBankingDate(rule.created_at)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="f-pill"
                        disabled
                        title={t('lib.pending_review.viewDetail')}
                      >
                        {t('lib.pending_review.viewDetail')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
