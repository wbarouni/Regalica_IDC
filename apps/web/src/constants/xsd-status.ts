/**
 * XSD validation status for xml_uploads.
 *
 * Source of truth: apps/api/migrations/024_xml_uploads.sql CHECK
 * constraint `xml_uploads_ck_xsd_status` enforces these three values
 * (or NULL). Surfaced as a typed constant so the UI never types a
 * status string literal.
 */
export const XSD_STATUSES = {
  PASSED: 'passed',
  FAILED: 'failed',
  PENDING: 'pending',
} as const;

export type XsdStatus = (typeof XSD_STATUSES)[keyof typeof XSD_STATUSES];

export const XSD_STATUS_VALUES: readonly XsdStatus[] = [
  XSD_STATUSES.PASSED,
  XSD_STATUSES.FAILED,
  XSD_STATUSES.PENDING,
];
