import { XMLParser } from 'fast-xml-parser';

export interface StructureError {
  dimension: number; // 1–7
  message: string;
  path?: string;
}

export interface StructureValidationResult {
  valid: boolean;
  errors: StructureError[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: true,
  isArray: (tagName) => tagName === 'Rubrique' || tagName === 'Colonne' || tagName === 'Annexe',
});

const DATE_RE = /^\d{8}$/;
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

function err(dimension: number, message: string, path?: string): StructureError {
  return { dimension, message, ...(path !== undefined ? { path } : {}) };
}

export function validateStructure(xmlContent: string): StructureValidationResult {
  const errors: StructureError[] = [];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  let raw: Record<string, unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    raw = parser.parse(xmlContent) as Record<string, unknown>;
  } catch {
    errors.push(err(1, 'XML is not well-formed'));
    return { valid: false, errors };
  }

  // D1 — root element is <Document>
  if (!('Document' in raw) || typeof raw['Document'] !== 'object' || raw['Document'] === null) {
    errors.push(err(1, 'Root element must be <Document>'));
    return { valid: false, errors };
  }

  const doc = raw['Document'] as Record<string, unknown>;

  // D2 — <Entete> present with required children
  if (!('Entete' in doc) || typeof doc['Entete'] !== 'object' || doc['Entete'] === null) {
    errors.push(err(2, '<Entete> element is missing'));
  } else {
    const entete = doc['Entete'] as Record<string, unknown>;
    for (const field of ['CodeBanque', 'DateAnnexe', 'CodeAnnexe'] as const) {
      if (!(field in entete) || entete[field] === undefined || entete[field] === null) {
        errors.push(err(2, `<Entete>.<${field}> is missing`, `Entete.${field}`));
      }
    }

    // D3 — DateAnnexe is YYYYMMDD
    if ('DateAnnexe' in entete) {
      const dateVal = String(entete['DateAnnexe']);
      if (!DATE_RE.test(dateVal)) {
        errors.push(err(3, `DateAnnexe must be YYYYMMDD, got: ${dateVal}`, 'Entete.DateAnnexe'));
      }
    }

    // D4 — exactly one <Annexe id="X"> where X == CodeAnnexe
    const codeAnnexe = String(entete['CodeAnnexe'] ?? '');
    if (!('Annexe' in doc)) {
      errors.push(err(4, '<Annexe> element is missing'));
    } else {
      const annexes = Array.isArray(doc['Annexe']) ? doc['Annexe'] : [doc['Annexe']];
      if (annexes.length !== 1) {
        errors.push(err(4, `Expected exactly one <Annexe>, found ${annexes.length}`));
      } else {
        const annexe = annexes[0] as Record<string, unknown>;
        const annexeId = String(annexe['@_id'] ?? '');
        // Normalize both for comparison (strip leading zeros)
        const normalizeForCmp = (v: string) => v.replace(/^0+/, '') || '0';
        if (normalizeForCmp(annexeId) !== normalizeForCmp(codeAnnexe)) {
          errors.push(
            err(
              4,
              `<Annexe id="${annexeId}"> does not match CodeAnnexe "${codeAnnexe}"`,
              'Annexe.@id',
            ),
          );
        }
      }
    }
  }

  // D5, D6, D7 — Rubrique/Colonne validation
  if ('Annexe' in doc) {
    const annexes = Array.isArray(doc['Annexe']) ? doc['Annexe'] : [doc['Annexe']];
    for (const annexe of annexes as Record<string, unknown>[]) {
      const rubriques = Array.isArray(annexe['Rubrique'])
        ? annexe['Rubrique']
        : annexe['Rubrique'] !== undefined
          ? [annexe['Rubrique']]
          : [];

      for (const rubrique of rubriques as Record<string, unknown>[]) {
        const rubId = rubrique['@_id'];

        // D5 — each Rubrique has valid non-empty id
        if (rubId === undefined || rubId === null || String(rubId).trim() === '') {
          errors.push(err(5, 'A <Rubrique> is missing a valid id attribute', 'Rubrique.@id'));
        }

        const colonnes = Array.isArray(rubrique['Colonne'])
          ? rubrique['Colonne']
          : rubrique['Colonne'] !== undefined
            ? [rubrique['Colonne']]
            : [];

        for (const col of colonnes as Record<string, unknown>[]) {
          const colId = col['@_id'];
          const colVal = col['#text'] ?? col;

          // D6 — each Colonne has numeric id
          if (colId === undefined || isNaN(Number(String(colId)))) {
            errors.push(
              err(6, `<Colonne> has non-numeric id: ${String(colId)}`, `Rubrique[${String(rubId)}].Colonne.@id`),
            );
          }

          // D7 — column values parseable as decimal
          const valStr = String(colVal);
          if (!NUMERIC_RE.test(valStr)) {
            errors.push(
              err(
                7,
                `Column value is not a valid decimal: "${valStr}"`,
                `Rubrique[${String(rubId)}].Colonne[${String(colId)}]`,
              ),
            );
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
