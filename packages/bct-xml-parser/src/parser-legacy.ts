/**
 * REGFlow — BCT XML Parser
 *
 * Parser de la nomenclature legacy (<ENTETE>, <BQ>, <CODE_ANNEXE>,
 * <RECAP_POS>, <DET_PSC>). Utilisée par l'annexe 810 Position de change.
 *
 * Contrairement à la nomenclature moderne tabulaire, la legacy expose des
 * balises métier typées (CODE_DEV, MAV_VEIL, MENG_VEIL, ACHAT, VENTE, etc.).
 *
 * Stratégie : mapping vers pseudo-rubriques et pseudo-colonnes via une table
 * de correspondance déclarée ici et synchronisable avec la table
 * `referentials_xml_structures` du Document 6.
 */

import { XMLParser } from 'fast-xml-parser';
import { Decimal } from 'decimal.js';

import type { CellMatrix, ParseWarning, XmlHeader } from './types.js';
import { ParseError } from './types.js';
import { normalizeDate } from './nomenclature.js';

interface LegacyParseResult {
  header: XmlHeader;
  cells: CellMatrix;
  rubriquesCount: number;
  valuesCount: number;
  warnings: ParseWarning[];
}

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
};

// Mapping balise legacy -> numéro de pseudo-colonne pour la structure 810 type 8.
// Source: CC-tech partie II §type 8 (position de change).
const RECAP_POS_COLUMN_MAP: Record<string, string> = {
  CODE_DEV: '1',
  MAV_VEIL: '2',
  MENG_VEIL: '3',
  ACHAT: '4',
  VENTE: '5',
  MAV_JJ: '6',
  MENG_JJ: '7',
  COURS: '8',
  CONTREVAL: '9',
  FPN_PR: '10',
};

const DET_PSC_COLUMN_MAP: Record<string, string> = {
  DATE_PSC: '1',
  CODE_DEV_PSC: '2',
  ACHAT_PSC: '3',
  VENTE_PSC: '4',
  SOLDE_PSC: '5',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any;

export function parseLegacy(xmlContent: string): LegacyParseResult {
  const parser = new XMLParser(PARSER_OPTIONS);
  let tree: XmlNode;
  try {
    tree = parser.parse(xmlContent);
  } catch (err) {
    throw new ParseError(`Invalid XML syntax: ${(err as Error).message}`, 'invalid_xml_syntax');
  }

  const doc = tree?.Document;
  if (!doc) {
    throw new ParseError('No <Document> root in legacy XML', 'no_recognizable_header');
  }

  const entete = doc.ENTETE;
  if (!entete) {
    throw new ParseError('No <ENTETE> in legacy XML', 'no_recognizable_header');
  }

  const warnings: ParseWarning[] = [];

  const codeBanque = extractScalar(entete.BQ);
  const dateDeclarRaw = extractScalar(entete.DATE_DECLAR);
  const codeAnnexe = extractScalar(entete.CODE_ANNEXE);

  if (!codeBanque) {
    warnings.push({ code: 'missing_code_banque', message: 'BQ absent ou vide' });
  }

  const dateAnnexe = normalizeDate(dateDeclarRaw);
  if (!dateAnnexe) {
    warnings.push({
      code: 'missing_date_annexe',
      message: 'DATE_DECLAR absente ou invalide',
      context: { raw: dateDeclarRaw },
    });
  }

  if (!codeAnnexe) {
    throw new ParseError('No CODE_ANNEXE in legacy XML', 'no_annexe_code');
  }

  const normalizedAnnexe = codeAnnexe; // Preserve exact code as in XML

  const header: XmlHeader = {
    codeBanque: codeBanque ?? '',
    dateAnnexe: dateAnnexe ?? '',
    codeAnnexe: normalizedAnnexe,
    nomenclature: 'legacy',
  };

  const cellsInner = new Map<string, Map<string, Decimal>>();
  let rubriquesCount = 0;
  let valuesCount = 0;

  // Parser les <RECAP_POS> : chaque occurrence est une pseudo-rubrique indexée par CODE_DEV
  const recap = doc.RECAP;
  if (recap) {
    const positions = normalizeArray(recap.RECAP_POS);
    for (const pos of positions) {
      const codeDev = extractScalar(pos.CODE_DEV);
      if (!codeDev) continue;
      rubriquesCount++;

      const pseudoRubrique = `RECAP_POS_${codeDev}`;
      const cols = new Map<string, Decimal>();

      for (const [tag, colId] of Object.entries(RECAP_POS_COLUMN_MAP)) {
        const raw = extractScalar(pos[tag]);
        if (raw === null || raw === '') continue;
        try {
          cols.set(colId, new Decimal(raw));
          valuesCount++;
        } catch {
          warnings.push({
            code: 'non_numeric_cell_value',
            message: `Valeur non numérique ${tag}=${raw} pour ${pseudoRubrique}`,
          });
        }
      }

      if (cols.size > 0) cellsInner.set(pseudoRubrique, cols);
    }
  }

  // Parser les <DET_PSC> : chaque entrée devient une pseudo-rubrique indexée par DATE_PSC + CODE_DEV
  const det = doc.DET;
  if (det) {
    const detItems = normalizeArray(det.DET_PSC);
    for (const item of detItems) {
      const datePsc = extractScalar(item.DATE_PSC);
      const codeDevPsc = extractScalar(item.CODE_DEV_PSC);
      if (!datePsc && !codeDevPsc) continue;
      rubriquesCount++;

      const pseudoRubrique = `DET_PSC_${datePsc ?? 'NODATE'}_${codeDevPsc ?? 'NODEV'}`;
      const cols = new Map<string, Decimal>();

      for (const [tag, colId] of Object.entries(DET_PSC_COLUMN_MAP)) {
        const raw = extractScalar(item[tag]);
        if (raw === null || raw === '') continue;
        // DATE_PSC et CODE_DEV_PSC sont textuels, pas numériques → skip Decimal
        if (tag === 'DATE_PSC' || tag === 'CODE_DEV_PSC') continue;
        try {
          cols.set(colId, new Decimal(raw));
          valuesCount++;
        } catch {
          warnings.push({
            code: 'non_numeric_cell_value',
            message: `Valeur non numérique ${tag}=${raw} pour ${pseudoRubrique}`,
          });
        }
      }

      if (cols.size > 0) cellsInner.set(pseudoRubrique, cols);
    }
  }

  if (rubriquesCount === 0) {
    warnings.push({
      code: 'empty_annexe',
      message: `Aucune position trouvée dans l'annexe legacy ${normalizedAnnexe}`,
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

function normalizeArray(val: unknown): XmlNode[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function extractScalar(node: unknown): string | null {
  if (node === null || node === undefined) return null;
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (node as any)['#text'];
    if (text !== undefined) return String(text).trim() || null;
    return null;
  }
  return null;
}
