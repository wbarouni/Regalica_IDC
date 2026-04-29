import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { LanguageSwitcher } from '../components/primitives/LanguageSwitcher';
import { PersonaSidebar } from '../components/layout/PersonaSidebar';
import { BCT_ANNEXE_GROUPS } from '../constants/bct-taxonomy';
import { XSD_STATUSES, XSD_STATUS_VALUES, type XsdStatus } from '../constants/xsd-status';
import { useCurrentRun } from '../hooks/useCurrentRun';
import { useDir } from '../hooks/useDir';
import { useFilings } from '../hooks/useFilings';
import { DEFAULT_PAGE_SIZE } from '../lib/config';

/**
 * Filings page — wired to GET /api/tenants/:tenantId/filings.
 *
 * Class names target the Edition One stylesheet
 * (apps/web/src/styles/primitives.css + filings.css). primitives.css
 * provides the shared shell (.persona, .canvas, .cmd, .ledger),
 * filings.css adds the Filings-specific classes (.masthead, .kpi,
 * .filters, .runs-table, .sig-*).
 */

const ALL_ANNEXE_CODES: readonly string[] = BCT_ANNEXE_GROUPS.flatMap((g) => [...g.codes]);

function statusPillClass(status: string | null): string {
  switch (status) {
    case XSD_STATUSES.PASSED:
      return 'pill pill--pass';
    case XSD_STATUSES.FAILED:
      return 'pill pill--fail';
    case XSD_STATUSES.PENDING:
      return 'pill pill--rounding';
    default:
      return 'pill pill--sentinel-c';
  }
}

export default function Filings(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  useDir();

  const [annexeFilter, setAnnexeFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<XsdStatus | undefined>(undefined);
  const [page, setPage] = useState<number>(1);

  const { run, loading: runLoading } = useCurrentRun();
  const { filings, loading, error, total } = useFilings({
    annexe: annexeFilter,
    status: statusFilter,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  return (
    <div className="app">
      <PersonaSidebar run={run} loading={runLoading} mode="filings" />

      <main className="canvas">
        <header className="cmd">
          <nav className="cmd__nav">
            <a className="active">{t('nav.filings')}</a>
            <a onClick={() => navigate('/workspace')}>{t('nav.workspace')}</a>
            <a onClick={() => navigate('/library')}>{t('nav.library')}</a>
          </nav>
          <div className="cmd__context">
            <LanguageSwitcher />
          </div>
        </header>

        <div className="ledger-filters">
          <select
            value={annexeFilter ?? ''}
            onChange={(e) => {
              setAnnexeFilter(e.target.value === '' ? undefined : e.target.value);
              setPage(1);
            }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              border: '1px solid var(--stone-300)',
              borderRadius: '4px',
              padding: '3px 8px',
              color: 'var(--ink)',
              background: 'var(--paper)',
            }}
          >
            <option value="">{t('filings.filterAnnexe')}</option>
            {ALL_ANNEXE_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          {XSD_STATUS_VALUES.map((s) => (
            <button
              key={s}
              type="button"
              className={`f-pill${statusFilter === s ? ' active' : ''}`}
              onClick={() => {
                setStatusFilter(statusFilter === s ? undefined : s);
                setPage(1);
              }}
            >
              {t(`filings.status.${s}`)}
            </button>
          ))}

          {(annexeFilter !== undefined || statusFilter !== undefined) && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setAnnexeFilter(undefined);
                setStatusFilter(undefined);
                setPage(1);
              }}
            >
              {t('filings.clearFilters')}
            </button>
          )}
        </div>

        <div className="thread-scroll">
          {loading && (
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

          {error !== null && (
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

          {!loading && error === null && (
            <div className="ledger-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>{t('filings.colAnnexe')}</th>
                    <th>{t('filings.colDate')}</th>
                    <th>{t('filings.colFichier')}</th>
                    <th className="num">{t('filings.colTaille')}</th>
                    <th>{t('filings.colXsd')}</th>
                    <th>{t('filings.colDepose')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filings.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          textAlign: 'center',
                          padding: '24px',
                          color: 'var(--stone-500)',
                        }}
                      >
                        {t('filings.noFilings')}
                      </td>
                    </tr>
                  )}
                  {filings.map((f) => (
                    <tr
                      key={f.id}
                      className={f.xsd_validation_status === XSD_STATUSES.FAILED ? 'row--fail' : ''}
                    >
                      <td>
                        <span className="mono">{f.code_annexe}</span>
                      </td>
                      <td>
                        <span className="mono">
                          {new Date(f.date_annexe).toLocaleDateString(i18n.language)}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--stone-800)' }}>{f.file_name}</td>
                      <td className="num">
                        <span className="mono">{(f.file_size_bytes / 1024).toFixed(0)} KB</span>
                      </td>
                      <td>
                        <span className={statusPillClass(f.xsd_validation_status)}>
                          <span className="pill__dot" />
                          {f.xsd_validation_status !== null
                            ? t(`filings.status.${f.xsd_validation_status}`)
                            : '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--stone-700)' }}>
                        {new Date(f.uploaded_at).toLocaleDateString(i18n.language)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {total > DEFAULT_PAGE_SIZE && (
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
      </main>
    </div>
  );
}
