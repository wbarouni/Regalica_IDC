import Decimal from 'decimal.js';
import { XMLParser } from 'fast-xml-parser';

Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });

export type CellMatrix = Map<string, Map<string, Map<string, Decimal>>>;

export interface ParsedXml {
  bankCode: string;
  dateAnnexe: string;
  annexeCode: string;
  cells: CellMatrix;
}

function normalizeId(raw: string | number): string {
  const s = String(raw);
  return s.replace(/^0+/, '') || '0';
}

interface RawColonne { '#text': string | number; '@_id': string | number }
interface RawRubrique { '@_id': string | number; Colonne: RawColonne | RawColonne[] }
interface RawAnnexe { '@_id': string | number; Rubrique: RawRubrique | RawRubrique[] }
interface RawDocument {
  Entete: { CodeBanque: string | number; DateAnnexe: string | number; CodeAnnexe: string | number };
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
  const raw = parser.parse(xmlContent) as { Document: RawDocument };
  const doc = raw.Document;
  const bankCode = String(doc.Entete.CodeBanque);
  const dateAnnexe = String(doc.Entete.DateAnnexe);
  const annexeCode = normalizeId(doc.Entete.CodeAnnexe);
  const cells: CellMatrix = new Map();

  if (!doc.Annexe) return { bankCode, dateAnnexe, annexeCode, cells };

  const annexes = Array.isArray(doc.Annexe) ? doc.Annexe : [doc.Annexe];
  for (const annexe of annexes) {
    const axCode = normalizeId(annexe['@_id']);
    const rubriqueMap = cells.get(axCode) ?? new Map<string, Map<string, Decimal>>();
    cells.set(axCode, rubriqueMap);
    const rubriques = Array.isArray(annexe.Rubrique) ? annexe.Rubrique : [annexe.Rubrique];
    for (const rubrique of rubriques) {
      const rubId = String(rubrique['@_id']);
      const colMap = rubriqueMap.get(rubId) ?? new Map<string, Decimal>();
      rubriqueMap.set(rubId, colMap);
      const colonnes = Array.isArray(rubrique.Colonne) ? rubrique.Colonne : [rubrique.Colonne];
      for (const col of colonnes) {
        colMap.set(normalizeId(col['@_id']), new Decimal(String(col['#text'])));
      }
    }
  }
  return { bankCode, dateAnnexe, annexeCode, cells };
}
