import Decimal from 'decimal.js';
import { XMLParser } from 'fast-xml-parser';

Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });

export type CellMatrix = Map<string, Map<string, Map<string, Decimal>>>;

export interface ParsedXml {
  bankCode: string;
  dateAnnexe: string; // YYYYMMDD
  annexeCode: string;
  cells: CellMatrix;
}

/** Strip leading zeros from a column/annexe ID string, keeping "0" for zero. */
function normalizeId(raw: string | number): string {
  const s = String(raw);
  const stripped = s.replace(/^0+/, '') || '0';
  return stripped;
}

/** Annexe alias: "0"→"00", "1"→"01" (inverse of normalizeId for lookup) — but
 *  we store by the normalized annexe code from the XML header itself.
 *  We also handle aliased lookups by normalizing consistently. */
function normalizeAnnexeCode(raw: string | number): string {
  return normalizeId(raw);
}

interface RawColonne {
  '#text': string | number;
  '@_id': string | number;
}

interface RawRubrique {
  '@_id': string | number;
  Colonne: RawColonne | RawColonne[];
}

interface RawAnnexe {
  '@_id': string | number;
  Rubrique: RawRubrique | RawRubrique[];
}

interface RawDocument {
  Entete: {
    CodeBanque: string | number;
    DateAnnexe: string | number;
    CodeAnnexe: string | number;
  };
  Annexe: RawAnnexe | RawAnnexe[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: true,
  isArray: (tagName) => tagName === 'Rubrique' || tagName === 'Colonne' || tagName === 'Annexe',
});

export function parseBctXml(xmlContent: string): ParsedXml {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const raw = parser.parse(xmlContent) as { Document: RawDocument };
  const doc = raw.Document;

  const bankCode = String(doc.Entete.CodeBanque);
  const dateAnnexe = String(doc.Entete.DateAnnexe);
  const annexeCode = normalizeAnnexeCode(doc.Entete.CodeAnnexe);

  const cells: CellMatrix = new Map();

  if (!doc.Annexe) {
    return { bankCode, dateAnnexe, annexeCode, cells };
  }

  const annexes: RawAnnexe[] = Array.isArray(doc.Annexe) ? doc.Annexe : [doc.Annexe];

  for (const annexe of annexes) {
    const axCode = normalizeAnnexeCode(annexe['@_id']);
    const rubriqueMap = cells.get(axCode) ?? new Map<string, Map<string, Decimal>>();
    cells.set(axCode, rubriqueMap);

    const rubriques: RawRubrique[] = Array.isArray(annexe.Rubrique)
      ? annexe.Rubrique
      : [annexe.Rubrique];

    for (const rubrique of rubriques) {
      const rubId = String(rubrique['@_id']);
      const colMap = rubriqueMap.get(rubId) ?? new Map<string, Decimal>();
      rubriqueMap.set(rubId, colMap);

      const colonnes: RawColonne[] = Array.isArray(rubrique.Colonne)
        ? rubrique.Colonne
        : [rubrique.Colonne];

      for (const col of colonnes) {
        const colId = normalizeId(col['@_id']);
        const value = new Decimal(String(col['#text']));
        colMap.set(colId, value);
      }
    }
  }

  return { bankCode, dateAnnexe, annexeCode, cells };
}
