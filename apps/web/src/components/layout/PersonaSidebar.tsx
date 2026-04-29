import { useTranslation } from 'react-i18next';

import { RUN_ID_DISPLAY_LENGTH } from '../../constants/ui';
import { BRAND_NAME, PRODUCT_NAME } from '../../lib/config';
import type { ValidationRun } from '../../types/api';

interface PersonaSidebarProps {
  run: ValidationRun | null;
  loading: boolean;
  mode: 'workspace' | 'library';
}

/**
 * Persona sidebar shared between Workspace and Library.
 *
 * Class names target the Edition One stylesheet (apps/web/src/styles/
 * primitives.css). Until that file lands, the markup renders unstyled
 * — the layout is structurally correct but visually plain. Once
 * primitives.css is imported, the look-and-feel matches the validated
 * mockup automatically.
 */
export function PersonaSidebar({ run, loading, mode }: PersonaSidebarProps): JSX.Element {
  const { t } = useTranslation();
  const brand = BRAND_NAME ?? '';
  const product = PRODUCT_NAME ?? '';
  return (
    <aside className="persona">
      <div className="persona__brand desktop-only">
        <div className="persona__mark" />
        <div>
          <div className="persona__brand-name">{brand}</div>
          <div className="persona__brand-sub">{product}</div>
        </div>
      </div>
      <div className="persona__mobile-wrap">
        <div className="persona__portrait-wrap">
          <img className="persona__portrait" src="/portrait.jpg" alt="Regalica" />
          <div className="persona__speaking">
            <span className="persona__speaking-dot" aria-hidden={!loading} />
          </div>
        </div>
        <h1 className="persona__name">Regalica</h1>
        <div className="persona__role desktop-only">{t('persona.role')}</div>
      </div>
      <div className="desktop-only">
        <div className="persona__status">
          <div className="persona__status-label">{t(`persona.mode.${mode}`)}</div>
          <div className="persona__status-mode">
            {run ? t('persona.statusMode') : t('error.noActiveRun')}
          </div>
          {run && (
            <div className="persona__status-sub">
              {run.total_fail_severe ?? 0} FAIL · {run.total_fail_rounding ?? 0}{' '}
              {t('persona.rounding')}
            </div>
          )}
        </div>
      </div>
      <div className="persona__stats desktop-only">
        {run && (
          <>
            <div className="persona__stat-row">
              <span className="persona__stat-label">{t('persona.statArrete')}</span>
              <span className="persona__stat-val mono">{run.arrete_date}</span>
            </div>
            <div className="persona__stat-row">
              <span className="persona__stat-label">{t('persona.statRun')}</span>
              <span className="persona__stat-val mono">
                #{run.run_id.slice(0, RUN_ID_DISPLAY_LENGTH)}
              </span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
