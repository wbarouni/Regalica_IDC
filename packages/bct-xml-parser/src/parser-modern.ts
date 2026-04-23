/**
 * REGFlow — BCT XML Parser
 *
 * Parser de la nomenclature moderne (<Entete>, <Annexe>, <Rubrique>, <Colonne>).
 */

import { XMLParser } from 'fast-xml-parser';
import { Decimal } from 'decimal.js';

import type { CellMatrix, ParseWarning, XmlHeader } from './types.js';
import { ParseError } from './types.js';
import { normalizeDate } from './nomenclature.js';

interface ModernParseResult {
  header: XmlHeader;
  cells: CellMatrix;
  rubriquesCount: number;
  valuesCount: number;
  warnings: ParseWarning[];
}

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any;

export function parseModern(xmlContent: string): ModernParseResult {
  const parser = new XMLParser(PARSER_OPTIONS);
  let tree: XmlNode;
  try {
    tree = parser.parse(xmlContent);
  } catch (err) {
    throw new ParseError(`Invalid XML syntax: ${(err as Error).message}`, 'invalid_xml_syntax');
  }

  const doc = tree?.Document;
  if (!doc) {
    throw new ParseError('No <Document> root element', 'no_recognizable_header');
  }

  const entete = doc.Entete;
  if (!entete) {
    throw new ParseError('No <Entete> in modern XML', 'no_recognizable_header');
  }

  const warnings: ParseWarning[] = [];

  const codeBanque = extractScalar(entete.CodeBanque);
  const dateAnnexeRaw = extractScalar(entete.DateAnnexe);
  const codeAnnexe = extractScalar(entete.CodeAnnexe);

  if (!codeBanque) {
    warnings.push({ code: 'missing_code_banque', message: 'CodeBanque absent ou vide' });
  }

  const dateAnnexe = normalizeDate(dateAnnexeRaw);
  if (!dateAnnexe) {
    warnings.push({
      code: 'missing_date_annexe',
      message: 'DateAnnexe absente ou invalide',
      context: { raw: dateAnnexeRaw },
    });
  }

  if (!codeAnnexe) {
    throw new ParseError('No CodeAnnexe in modern XML', 'no_annexe_code');
  }

  const normalizedAnnexe = codeAnnexe; // Preserve exact code as in XML

  const header: XmlHeader = {
    codeBanque: codeBanque ?? '',
    dateAnnexe: dateAnnexe ?? '',
    codeAnnexe: normalizedAnnexe,
    nomenclature: 'modern',
  };

  // Extraction de la matrice de cellules
  const annexe = doc.Annexe;
  const cellsInner = new Map<string, Map<string, Decimal>>();
  let rubriquesCount = 0;
  let valuesCount = 0;

  if (annexe) {
    // Recherche des <Rubrique> directement sous <Annexe> OU sous des sous-containers
    // (ex: <Societe><Rubrique/></Societe> pour sentinelles D1-D6)
    const rubriques = collectRubriques(annexe);
    for (const rub of rubriques) {
      const rubId = rub['@_id'];
      if (!rubId) continue;

      rubriquesCount++;

      const existing = cellsInner.get(rubId);
      if (existing) {
        warnings.push({
          code: 'duplicate_rubrique',
          message: `Rubrique ${rubId} apparaît plusieurs fois dans l'annexe ${normalizedAnnexe}`,
        });
      }

      const colonnesMap = existing ?? new Map<string, Decimal>();
      const colonnes = normalizeArray(rub.Colonne);
      for (const col of colonnes) {
        const colId = col['@_id'];
        if (!colId) continue;

        const rawValue = extractScalar(col);
        if (rawValue === null || rawValue === '') continue;

        try {
          const value = new Decimal(rawValue);
          colonnesMap.set(colId, value);
          valuesCount++;
        } catch {
          warnings.push({
            code: 'non_numeric_cell_value',
            message: `Valeur non numérique pour ${normalizedAnnexe}/${rubId}/col ${colId}`,
            context: { rawValue },
          });
        }
      }

      if (colonnesMap.size > 0) {
        cellsInner.set(rubId, colonnesMap);
      }
    }
  }

  if (rubriquesCount === 0) {
    warnings.push({
      code: 'empty_annexe',
      message: `Aucune rubrique trouvée dans l'annexe ${normalizedAnnexe}`,
    });
  }

  const outerMap = new Map<string, Map<string, Map<string, Decimal>>>([
    [normalizedAnnexe, cellsInner],
  ]);

  return {
    header,
    cells: outerMap as CellMatrix,
    rubriquesCount,
    valuesCount,
    warnings,
  };
}

/**
 * Récursivement collecte toutes les <Rubrique> sous un noeud donné,
 * qu'elles soient directement enfants ou nichées dans <Societe>, <Membre>, etc.
 */
function collectRubriques(node: XmlNode): XmlNode[] {
  const out: XmlNode[] = [];
  if (!node) return out;

  if (node.Rubrique) {
    const rubs = normalizeArray(node.Rubrique);
    out.push(...rubs);
  }

  // Conteneurs connus pour héberger des rubriques en sentinelles D
  const containerKeys = ['Societe', 'Membre', 'Instrument', 'Devise'];
  for (const key of containerKeys) {
    if (node[key]) {
      const children = normalizeArray(node[key]);
      for (const child of children) {
        out.push(...collectRubriques(child));
      }
    }
  }

  return out;
}

function normalizeArray(val: unknown): XmlNode[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function extractScalar(node: unknown): string | null {
  if (node === null || node === undefined) return null;
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object') {
    // fast-xml-parser renders <Tag>value</Tag> as { "#text": "value" } if attributes exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (node as any)['#text'];
    if (text !== undefined) return String(text).trim() || null;
    return null;
  }
  return null;
}
