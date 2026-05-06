import { useTranslation } from 'react-i18next';

import type { FailDetail } from '../types/api';
import { formatBankingNumber } from '../utils/banking';

import { ConfidenceBadge } from './ConfidenceBadge';

/**
 * C — Investigation block reusing the orphan Edition One primitives
 * (.decomp / .decomp__head / .decomp__row / .decomp__rang / .decomp__val
 * / .calc-block / .inspector / .proof-section / .proof-label /
 * .proof-value / .proof-gap) defined in apps/web/src/styles/
 * primitives.css since commit 0668438. Until C, all 12 of those classes
 * had zero React consumer (verified by `comm -23 defined used` in the
 * preceding maquette audit). The user demand was explicit: "où est
 * LHS RHS, où est le detailed report, les fails explanations".
 *
 * C ships the MINIMAL form of the workspace v5 mockup investigation
 * block (`docs/mockups/regalica-workspace-v5.html` :896-1062): the
 * decomposition table is collapsed to two rows (R1 = Right-Hand-Side
 * = expected_value, R2 = Left-Hand-Side = computed_value) instead of
 * the full term-by-term breakdown. A future tranche will deepen by
 * unpacking `validation_fail_details.calculation_trace` JSONB into N
 * R2 rows; the contract here is that the structural CSS works and
 * the explanation surface is visible.
 *
 * The right-side `.inspector` aside summarises the rule address (ax,
 * num_regle, severity) so the operator reads the verdict in two
 * passes (decomposition first, address inspector second). The
 * calc-block on top renders the comparison formula and the gap as a
 * banking-format expression.
 *
 * Confidence level mirrors the FAIL severity: severe → low (urgent),
 * rounding → medium (auditable). This is consistent with the
 * RegalicaRunSpeech mapping where 0 severe = high confidence.
 *
 * Banking convention: fr-FR thin-space thousands + comma decimal on
 * every numeric cell (CLAUDE.md §11). Locale fixed to fr-FR for the
 * cell values; headers + labels resolve via i18n.
 */

function deriveConfidenceFromSeverity(severity: 'severe' | 'rounding'): 'high' | 'medium' | 'low' {
  return severity === 'severe' ? 'low' : 'medium';
}

export interface InvestigationArtefactProps {
  fail: FailDetail;
}

export function InvestigationArtefact({ fail }: InvestigationArtefactProps): JSX.Element {
  const { t } = useTranslation();
  const expected = fail.expected_value;
  const computed = fail.computed_value;
  const gap = fail.gap_absolute;
  const gapRel = fail.gap_relative;
  const confidenceLevel = deriveConfidenceFromSeverity(fail.severity);

  return (
    <article
      className="artefact artefact--livrable_c"
      data-state="standard"
      data-testid="investigation-artefact"
    >
      <header className="artefact__header">
        <span className="artefact__title">
          {t('investigation.title', {
            ax: fail.ax_term,
            num: fail.num_regle,
            defaultValue: 'Investigation · Règle {{ax}}/{{num}}',
          })}
        </span>
        <span className="artefact__subtitle">
          {t('investigation.subtitle', {
            defaultValue: 'Décomposition RDG · valeur attendue (RHS) vs valeur calculée (LHS)',
          })}
        </span>
      </header>

      <div className="artefact__body">
        <div className="inv-grid">
          <div className="inv-body">
            <h4>
              {t('investigation.decompositionLabel', {
                defaultValue: 'Décomposition terme à terme',
              })}
            </h4>
            <div className="decomp">
              <div className="decomp__head">
                <div>{t('investigation.col.rang', { defaultValue: 'Rang' })}</div>
                <div>{t('investigation.col.role', { defaultValue: 'Rôle' })}</div>
                <div>{t('investigation.col.address', { defaultValue: 'Adresse' })}</div>
                <div>{t('investigation.col.context', { defaultValue: 'Contexte' })}</div>
                <div>{t('investigation.col.value', { defaultValue: 'Valeur' })}</div>
                <div>{t('investigation.col.cite', { defaultValue: 'Source' })}</div>
              </div>
              <div className="decomp__row">
                <div className="decomp__rang">R1</div>
                <div className="mono">{t('investigation.role.rhs', { defaultValue: 'RHS' })}</div>
                <div className="mono">
                  {fail.ax_term}/{fail.num_regle}
                </div>
                <div className="mono">
                  {t('investigation.context.expected', { defaultValue: 'Valeur attendue' })}
                </div>
                <div className="decomp__val">{formatBankingNumber(expected)}</div>
                <div className="decomp__cite">RDG</div>
              </div>
              <div className="decomp__row">
                <div className="decomp__rang decomp__rang--2">R2</div>
                <div className="mono">{t('investigation.role.lhs', { defaultValue: 'LHS' })}</div>
                <div className="mono">
                  {fail.ax_term}/{fail.num_regle}
                </div>
                <div className="mono">
                  {t('investigation.context.computed', { defaultValue: 'Somme calculée XML' })}
                </div>
                <div
                  className={`decomp__val${
                    fail.severity === 'severe' ? ' decomp__val--missing' : ''
                  }`}
                >
                  {formatBankingNumber(computed)}
                </div>
                <div className="decomp__cite">XML</div>
              </div>
            </div>

            <h4>{t('investigation.calcBlockLabel', { defaultValue: 'Bloc de calcul' })}</h4>
            <div className="calc-block">
              <span className="c-comment">
                {t('investigation.calc.comment', { defaultValue: '// règle' })} {fail.ax_term}/
                {fail.num_regle}
              </span>
              <br />
              <span>R1 (RHS)</span> <span className="c-op">=</span>{' '}
              <span className="c-num">{formatBankingNumber(expected)}</span>
              <br />
              <span>R2 (LHS)</span> <span className="c-op">=</span>{' '}
              <span className={fail.severity === 'severe' ? 'c-fail' : 'c-num'}>
                {formatBankingNumber(computed)}
              </span>
              <br />
              <span className="c-result">
                <span className="c-op">Δ</span> ={' '}
                <span className={fail.severity === 'severe' ? 'c-fail' : 'c-num'}>
                  {formatBankingNumber(gap)}
                </span>
                {gapRel !== null && (
                  <>
                    {'  '}
                    <span className="c-comment">
                      ({(Number(gapRel) * 100).toFixed(2).replace('.', ',')} %)
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>

          <aside className="inspector">
            <div className="inspector__meta">
              {t('investigation.inspector.title', { defaultValue: 'Adresse RDG' })}
            </div>
            <div className="inspector__rule">
              {t('investigation.inspector.rule', {
                ax: fail.ax_term,
                num: fail.num_regle,
                defaultValue: 'Règle {{ax}}/{{num}}',
              })}
            </div>

            <div className="proof-section">
              <div className="proof-label">
                {t('investigation.inspector.severityLabel', { defaultValue: 'Sévérité' })}
              </div>
              <div className="proof-address">
                {t(`investigation.inspector.severity.${fail.severity}`, {
                  defaultValue: fail.severity === 'severe' ? 'Sévère' : 'Arrondi',
                })}
              </div>
            </div>

            <div className="proof-section">
              <div className="proof-label">
                {t('investigation.inspector.operatorLabel', { defaultValue: 'Opérateur' })}
              </div>
              <div className="proof-address mono">{fail.operateur}</div>
            </div>

            <div className="proof-gap">
              <div className="proof-label">
                {t('investigation.inspector.gapLabel', { defaultValue: 'Écart final' })}
              </div>
              <div className="proof-value">{formatBankingNumber(gap)}</div>
            </div>

            <div className="brief-foot" style={{ marginTop: '12px' }}>
              <ConfidenceBadge
                level={confidenceLevel}
                label={t(`investigation.confidence.${confidenceLevel}`, {
                  defaultValue:
                    confidenceLevel === 'low'
                      ? 'Hypothèse forte · cause à corriger'
                      : 'Écart d’arrondi · arbitrage opérateur',
                })}
              />
            </div>
          </aside>
        </div>
      </div>
    </article>
  );
}
