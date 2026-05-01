import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * DaySeparator — renders the .thread__day pattern from primitives.css
 * (two horizontal hairlines flanking a centered uppercase label).
 *
 * The label is built from the active i18n locale via the native
 * Intl.DateTimeFormat — no external date library is needed for this
 * one call site, and the locale segregation is handled by Intl
 * itself (Intl.DateTimeFormat('ar-TN') already returns Arabic-Indic
 * digits when appropriate, which keeps the RTL build coherent).
 *
 * The translation slot artefact-side is t('date.dayLabel', { date })
 * — added in commit B2 with a pure {{date}} interpolation so the
 * formatted string flows through unchanged. This indirection means
 * an operator can wrap the date in a localised prefix later
 * ("Aujourd'hui · {{date}}") without touching the component.
 */

export interface DaySeparatorProps {
  date: Date;
}

const FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

export function DaySeparator({ date }: DaySeparatorProps): JSX.Element {
  const { t, i18n } = useTranslation();

  const formatted = useMemo(() => {
    return new Intl.DateTimeFormat(i18n.language, FORMAT_OPTIONS).format(date);
  }, [date, i18n.language]);

  return (
    <div
      className="thread__day"
      role="separator"
      aria-label={formatted}
      data-iso={date.toISOString()}
    >
      <span className="thread__day-line" aria-hidden="true" />
      <span className="thread__day-label">{t('date.dayLabel', { date: formatted })}</span>
      <span className="thread__day-line" aria-hidden="true" />
    </div>
  );
}
