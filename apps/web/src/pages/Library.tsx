import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { LanguageSwitcher } from '../components/primitives/LanguageSwitcher';
import { PersonaSidebar } from '../components/layout/PersonaSidebar';
import { PendingRulesPanel } from '../components/PendingRulesPanel';
import { BCT_ANNEXE_GROUPS } from '../constants/bct-taxonomy';
import { RULE_LABEL_PREVIEW_LENGTH } from '../constants/ui';
import { useCurrentRun } from '../hooks/useCurrentRun';
import { useDir } from '../hooks/useDir';
import { useReferentials } from '../hooks/useReferentials';
import { useRules } from '../hooks/useRules';
import { DEFAULT_PAGE_SIZE } from '../lib/config';
import { RULE_STATUSES, type RuleStatus } from '../types/api';

/**
 * Library page — wired to GET /rules, /referentials and
 * /rules/pending-review (via the dedicated <PendingRulesPanel>
 * mounted at the top of the rules rayon, K3).
 *
 * Class names target the Edition One stylesheet
 * (apps/web/src/styles/primitives.css). Inline `style={{...}}`
 * attributes carry the layout-critical bits (column widths, scroll,
 * padding) for elements not yet expressed as named primitives.
 */

type Rayon = 'rules' | 'referentials' | 'circulaires' | 'filings';

const RAYONS: readonly Rayon[] = ['rules', 'referentials', 'circulaires', 'filings'];

function statusPillClass(status: string): string {
  if (status === RULE_STATUSES.ACTIVE) return 'pill pill--pass';
  if (status === RULE_STATUSES.PENDING_REVIEW) return 'pill pill--rounding';
  return 'pill pill--sentinel-c';
}

export default function Library(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  useDir();

  const [activeRayon, setActiveRayon] = useState<Rayon>('rules');
  const [axTermFilter, setAxTermFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<RuleStatus | undefined>(RULE_STATUSES.ACTIVE);

  const { run, loading: runLoading } = useCurrentRun();

  const {
    rules,
    loading: rulesLoading,
    error: rulesError,
    total: rulesTotal,
    page,
    setPage,
  } = useRules({ axTerm: axTermFilter, status: statusFilter });

  const { rules: pendingRules } = useRules({ status: RULE_STATUSES.PENDING_REVIEW });

  const { referentials, loading: refLoading } = useReferentials();

  const totalPages = Math.max(1, Math.ceil(rulesTotal / DEFAULT_PAGE_SIZE));

  return (
    <div className="app">
      <PersonaSidebar run={run} loading={runLoading} mode="library" />

      <main className="canvas">
        <header className="cmd">
          <nav className="cmd__nav">
            <a onClick={() => navigate('/filings')}>{t('nav.filings')}</a>
            <a onClick={() => navigate('/workspace')}>{t('nav.workspace')}</a>
            <a className="active">{t('nav.library')}</a>
          </nav>
          <div className="cmd__context">
            <LanguageSwitcher />
          </div>
        </header>

        <nav className="ledger-filters" style={{ borderBottom: '1px solid var(--stone-200)' }}>
          {RAYONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`f-pill${activeRayon === r ? ' active' : ''}`}
              onClick={() => setActiveRayon(r)}
            >
              {t(`lib.rayons.${r}`)}
              {r === 'rules' && pendingRules.length > 0 && (
                <span className="f-pill__count">{pendingRules.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {activeRayon === 'rules' && (
            <aside
              style={{
                width: '180px',
                flexShrink: 0,
                borderRight: '1px solid var(--stone-200)',
                padding: '16px 12px',
                overflowY: 'auto',
                background: 'var(--paperPure)',
              }}
            >
              <div className="section-label" style={{ marginBottom: '8px' }}>
                {t('lib.domains.label')}
              </div>
              <button
                type="button"
                className={`f-pill${axTermFilter === undefined ? ' active' : ''}`}
                style={{
                  width: '100%',
                  marginBottom: '6px',
                  justifyContent: 'start',
                }}
                onClick={() => {
                  setAxTermFilter(undefined);
                  setPage(1);
                }}
              >
                {t('lib.filterAll')}
              </button>
              {BCT_ANNEXE_GROUPS.map((g) => (
                <div key={g.domainKey} style={{ marginBottom: '12px' }}>
                  <div className="meta" style={{ marginBottom: '4px' }}>
                    {t(g.domainKey)}
                  </div>
                  {g.codes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={`f-pill${axTermFilter === code ? ' active' : ''}`}
                      style={{
                        width: '100%',
                        marginBottom: '4px',
                        justifyContent: 'start',
                        fontFamily: 'var(--font-mono)',
                      }}
                      onClick={() => {
                        setAxTermFilter(code);
                        setPage(1);
                      }}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              ))}
            </aside>
          )}

          <div className="thread-scroll" style={{ flex: 1 }}>
            {activeRayon === 'rules' && (
              <div>
                <PendingRulesPanel />
                <div className="ledger-filters">
                  {[
                    { key: RULE_STATUSES.ACTIVE, label: t('lib.filterActive') },
                    {
                      key: RULE_STATUSES.PENDING_REVIEW,
                      label: t('lib.filterPending'),
                    },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className={`f-pill${statusFilter === f.key ? ' active' : ''}`}
                      onClick={() => {
                        setStatusFilter(f.key);
                        setPage(1);
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`f-pill${statusFilter === undefined ? ' active' : ''}`}
                    onClick={() => {
                      setStatusFilter(undefined);
                      setPage(1);
                    }}
                  >
                    {t('lib.filterCross')}
                  </button>
                </div>

                {rulesLoading && (
                  <div
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      color: 'var(--stone-500)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                    }}
                  >
                    {t('loading')}
                  </div>
                )}

                {rulesError !== null && (
                  <div
                    style={{
                      padding: '32px',
                      color: 'var(--vermilion-700)',
                      fontSize: '13px',
                    }}
                  >
                    {t('error.generic')}
                  </div>
                )}

                {!rulesLoading && rulesError === null && (
                  <div className="ledger-wrap">
                    <table className="ledger">
                      <thead>
                        <tr>
                          <th>{t('lib.colNumRegle')}</th>
                          <th>{t('lib.colRubrique')}</th>
                          <th>{t('lib.colOper')}</th>
                          <th className="num">{t('lib.colTerms')}</th>
                          <th>{t('lib.colType')}</th>
                          <th>{t('lib.colStatus')}</th>
                          <th>{t('lib.colVersion')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rules.length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              style={{
                                textAlign: 'center',
                                padding: '24px',
                                color: 'var(--stone-500)',
                              }}
                            >
                              {t('lib.noRules')}
                            </td>
                          </tr>
                        )}
                        {rules.map((rule) => {
                          const labelTrim = rule.natural_language.slice(
                            0,
                            RULE_LABEL_PREVIEW_LENGTH,
                          );
                          const labelEllipsis =
                            rule.natural_language.length > RULE_LABEL_PREVIEW_LENGTH ? '…' : '';
                          return (
                            <tr
                              key={rule.id}
                              className={
                                rule.status === RULE_STATUSES.PENDING_REVIEW ? 'row--fail' : ''
                              }
                            >
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
                                  {rule.operator}
                                </span>
                              </td>
                              <td className="num">
                                <span className="mono">{rule.terms_count}</span>
                              </td>
                              <td>
                                <span className="cite">{rule.type_ctrl_computed}</span>
                              </td>
                              <td>
                                <span className={statusPillClass(rule.status)}>
                                  <span className="pill__dot" />
                                  {t(`lib.status.${rule.status}`)}
                                </span>
                              </td>
                              <td>
                                <span className="mono" style={{ fontSize: '11px' }}>
                                  v{rule.version}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {rulesTotal > DEFAULT_PAGE_SIZE && (
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          padding: '12px 24px',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          borderTop: '1px solid var(--stone-100)',
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={page === 1}
                          onClick={() => setPage(Math.max(1, page - 1))}
                        >
                          {'<'}
                        </button>
                        <span style={{ fontSize: '12px', color: 'var(--stone-700)' }}>
                          {page} / {totalPages}
                        </span>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={page >= totalPages}
                          onClick={() => setPage(page + 1)}
                        >
                          {'>'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeRayon === 'referentials' && (
              <div>
                {refLoading && (
                  <div
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      color: 'var(--stone-500)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                    }}
                  >
                    {t('loading')}
                  </div>
                )}
                {!refLoading && (
                  <div className="ledger-wrap">
                    <table className="ledger">
                      <thead>
                        <tr>
                          <th>{t('lib.colType')}</th>
                          <th className="num">{t('lib.colEntries')}</th>
                          <th>{t('lib.colUpdatedAt')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {referentials.map((ref) => (
                          <tr key={ref.code}>
                            <td>
                              <span className="mono">{ref.code}</span>
                            </td>
                            <td className="num">
                              <span className="mono">{ref.entry_count}</span>
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--stone-700)' }}>
                              {ref.last_updated_at !== null
                                ? new Date(ref.last_updated_at).toLocaleDateString(i18n.language)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeRayon === 'circulaires' && (
              <div className="locked-body">
                <p
                  style={{
                    color: 'var(--stone-600)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {t('lib.circulairesComingSoon')}
                </p>
              </div>
            )}

            {activeRayon === 'filings' && (
              <div className="locked-body">
                <p
                  style={{
                    color: 'var(--stone-600)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {t('lib.filingsComingSoon')}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
