import { useTranslation } from 'react-i18next';

import type { ValidationRun } from '../types/api';

import { ConfidenceBadge } from './ConfidenceBadge';

/**
 * B — Regalica conversational speech post-run.
 *
 * Mounted above T1Deliverables when run.status === 'completed' to
 * frame the synthesis/livrables as Regalica's voice (msg-rega /
 * portrait / time / confidence badge) — exactly the pattern in the
 * workspace v5 mockup at lines 626-697 of
 * `docs/mockups/regalica-workspace-v5.html`.
 *
 * The narrative line is a deterministic 3-segment composition driven
 * by the run row (totals + duration). No LLM call: the synthesis
 * markdown ALREADY lives in run.synthesis_artifact (chatbot-py wrote
 * it through /finalize via Tranche 0.7 commit cb28e06). This component
 * adds the conversational FRAME so the user reads "Regalica is
 * speaking", not "the system rendered a card".
 *
 * Banking conventions (CLAUDE.md §11):
 *   - Duration: 1 decimal, fr-FR locale "3,2 s"
 *   - Counts: thin-space thousands "1 245 règles"
 *   - Time: HH:MM banking (locale fr-FR via toLocaleTimeString)
 *
 * The user-facing copy resolves through i18n. ConfidenceBadge level
 * is derived from total_fail_severe (0 → high, 1-3 → medium, ≥4 → low)
 * because the ANC reading of confidence in this context is "how
 * confident is the run that no severe issue was missed" — a function
 * of the severity tail.
 */

const BANKING_NUMBER_FMT = new Intl.NumberFormat('fr-FR');
const BANKING_DURATION_FMT = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function deriveConfidence(failSevere: number): 'high' | 'medium' | 'low' {
  if (failSevere === 0) return 'high';
  if (failSevere <= 3) return 'medium';
  return 'low';
}

export interface RegalicaRunSpeechProps {
  run: ValidationRun;
}

export function RegalicaRunSpeech({ run }: RegalicaRunSpeechProps): JSX.Element | null {
  const { t, i18n } = useTranslation();
  if (run.status !== 'completed') {
    return null;
  }
  const totalRules = run.total_rules_evaluated ?? 0;
  const failSevere = run.total_fail_severe ?? 0;
  const failRounding = run.total_fail_rounding ?? 0;
  const durationSeconds = run.execution_time_ms !== null ? run.execution_time_ms / 1000 : null;
  const completedAt = run.completed_at !== null ? new Date(run.completed_at) : null;
  const completedTimeLabel =
    completedAt !== null
      ? completedAt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
      : null;
  const confidenceLevel = deriveConfidence(failSevere);

  return (
    <div className="msg-rega" data-testid="regalica-run-speech">
      <div className="msg-rega__avatar">
        <img src="/portrait.jpg" alt="Regalica" />
      </div>
      <div className="msg-rega__body">
        <div className="msg-rega__head">
          <span className="msg-rega__name">{t('regalica.name', { defaultValue: 'Regalica' })}</span>
          {completedTimeLabel !== null && (
            <span className="msg-rega__time">{completedTimeLabel}</span>
          )}
        </div>
        <div className="msg-rega__text">
          <p>
            {durationSeconds !== null
              ? t('regalica.runSpeech.opening', {
                  duration: BANKING_DURATION_FMT.format(durationSeconds),
                  defaultValue: 'Validation terminée en {{duration}} s.',
                })
              : t('regalica.runSpeech.openingNoTime', {
                  defaultValue: 'Validation terminée.',
                })}{' '}
            {t('regalica.runSpeech.totals', {
              total: BANKING_NUMBER_FMT.format(totalRules),
              failSevere: BANKING_NUMBER_FMT.format(failSevere),
              failRounding: BANKING_NUMBER_FMT.format(failRounding),
              defaultValue:
                '{{total}} règles évaluées · {{failSevere}} FAIL sévères · {{failRounding}} arrondis.',
            })}{' '}
            {t('regalica.runSpeech.outline', {
              defaultValue:
                'Voici la synthèse, puis l’analyse de cause racine, puis le détail des FAIL.',
            })}
          </p>
        </div>
        <div className="brief-foot" style={{ marginTop: '8px' }}>
          <ConfidenceBadge
            level={confidenceLevel}
            label={t(`regalica.runSpeech.confidence.${confidenceLevel}`, {
              defaultValue:
                confidenceLevel === 'high'
                  ? 'Validation complète · 0 FAIL sévère'
                  : confidenceLevel === 'medium'
                    ? 'Validation complète · attention requise'
                    : 'Validation complète · revue prioritaire',
            })}
          />
        </div>
      </div>
    </div>
  );
}
