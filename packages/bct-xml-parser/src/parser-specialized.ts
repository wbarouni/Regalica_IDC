/**
 * REGFlow — BCT XML Parser
 *
 * Parser de la nomenclature specialized pour l'annexe 781 (taux créditeurs
 * et débiteurs). Structure :
 *
 * <Document>
 *   <Entete>...</Entete>
 *   <Annexe id="781">
 *     <TauxCrediteurs>
 *       <Produit>
 *         <CodeNatureCompte>NAT1</CodeNatureCompte>
 *         <CodeSegmentClient>SEG1</CodeSegmentClient>
 *         <Taux_Min_DT>1.5</Taux_Min_DT>
 *         <Taux_Max_DT>3.0</Taux_Max_DT>
 *         ...
 *       </Produit>
 *     </TauxCrediteurs>
 *     <TauxDebiteurs>
 *       <Operation>
 *         <CodeTypeOperation>OP1</CodeTypeOperation>
 *         <Taux_Min_DT>5.0</Taux_Min_DT>
 *         ...
 *       </Operation>
 *     </TauxDebiteurs>
 *   </Annexe>
 * </Document>
 *
 * Mapping : chaque <Produit> ou <Operation> devient une pseudo-rubrique,
 * identifiée par la concaténation des codes de classification. Les taux
 * deviennent des pseudo-colonnes numérotées.
 */

import { XMLParser } from "fast-xml-parser";
import { Decimal } from "decimal.js";


import type { CellMatrix, ParseWarning, XmlHeader } from "./types.js";
import { ParseError } from "./types.js";
import { normalizeDate } from "./nomenclature.js";

interface SpecializedParseResult {
  header: XmlHeader;
  cells: CellMatrix;
  rubriquesCount: number;
  valuesCount: number;
  warnings: ParseWarning[];
}

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
};

// Mapping balise -> numéro de pseudo-colonne pour Produit crediteur
const PRODUIT_COLUMN_MAP: Record<string, string> = {
  Taux_Min_DT: "1",
  Taux_Min_DTC: "2",
  Taux_Min_Dev: "3",
  Taux_Max_DT: "4",
  Taux_Max_DTC: "5",
  Taux_Max_Dev: "6",
};

const OPERATION_COLUMN_MAP: Record<string, string> = {
  Taux_Min_DT: "1",
  Taux_Min_DTC: "2",
  Taux_Min_Dev: "3",
  Taux_Max_DT: "4",
  Taux_Max_DTC: "5",
  Taux_Max_Dev: "6",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any;

export function parseSpecialized(xmlContent: string): SpecializedParseResult {
  const parser = new XMLParser(PARSER_OPTIONS);
  let tree: XmlNode;
  try {
    tree = parser.parse(xmlContent);
  } catch (err) {
    throw new ParseError(
      `Invalid XML syntax: ${(err as Error).message}`,
      "invalid_xml_syntax",
    );
  }

  const doc = tree?.Document;
  if (!doc) {
    throw new ParseError(
      "No <Document> root in specialized XML",
      "no_recognizable_header",
    );
  }

  const entete = doc.Entete;
  if (!entete) {
    throw new ParseError(
      "No <Entete> in specialized XML",
      "no_recognizable_header",
    );
  }

  const warnings: ParseWarning[] = [];

  const codeBanque = extractScalar(entete.CodeBanque);
  const dateAnnexeRaw = extractScalar(entete.DateAnnexe);
  const codeAnnexe = extractScalar(entete.CodeAnnexe);

  if (!codeBanque) {
    warnings.push({ code: "missing_code_banque", message: "CodeBanque absent" });
  }

  const dateAnnexe = normalizeDate(dateAnnexeRaw);
  if (!dateAnnexe) {
    warnings.push({
      code: "missing_date_annexe",
      message: "DateAnnexe absente dans XML specialized",
    });
  }

  if (!codeAnnexe) {
    throw new ParseError("No CodeAnnexe in specialized XML", "no_annexe_code");
  }

  const normalizedAnnexe = codeAnnexe; // Preserve exact code as in XML

  const header: XmlHeader = {
    codeBanque: codeBanque ?? "",
    dateAnnexe: dateAnnexe ?? "",
    codeAnnexe: normalizedAnnexe,
    nomenclature: "specialized",
  };

  const cellsInner = new Map<string, Map<string, Decimal>>();
  let rubriquesCount = 0;
  let valuesCount = 0;

  const annexe = doc.Annexe;
  if (annexe) {
    const taux_crediteurs = annexe.TauxCrediteurs;
    if (taux_crediteurs) {
      const produits = normalizeArray(taux_crediteurs.Produit);
      for (const prod of produits) {
        const nature = extractScalar(prod.CodeNatureCompte) ?? "UNK";
        const segment = extractScalar(prod.CodeSegmentClient) ?? "UNK";
        const pseudoRubrique = `TauxCrediteurs_${nature}_${segment}`;

        // Dédup si déjà vu
        if (cellsInner.has(pseudoRubrique)) {
          warnings.push({
            code: "duplicate_rubrique",
            message: `Produit crediteur dupliqué: ${nature}/${segment}`,
          });
          continue;
        }
        rubriquesCount++;

        const cols = new Map<string, Decimal>();
        for (const [tag, colId] of Object.entries(PRODUIT_COLUMN_MAP)) {
          const raw = extractScalar(prod[tag]);
          if (raw === null || raw === "") continue;
          try {
            cols.set(colId, new Decimal(raw));
            valuesCount++;
          } catch {
            warnings.push({
              code: "non_numeric_cell_value",
              message: `Valeur non numérique ${tag}=${raw} pour ${pseudoRubrique}`,
            });
          }
        }
        if (cols.size > 0) cellsInner.set(pseudoRubrique, cols);
      }
    }

    const taux_debiteurs = annexe.TauxDebiteurs;
    if (taux_debiteurs) {
      const operations = normalizeArray(taux_debiteurs.Operation);
      for (const op of operations) {
        const codeOp = extractScalar(op.CodeTypeOperation) ?? "UNK";
        const pseudoRubrique = `TauxDebiteurs_${codeOp}`;

        if (cellsInner.has(pseudoRubrique)) {
          warnings.push({
            code: "duplicate_rubrique",
            message: `Operation débitrice dupliquée: ${codeOp}`,
          });
          continue;
        }
        rubriquesCount++;

        const cols = new Map<string, Decimal>();
        for (const [tag, colId] of Object.entries(OPERATION_COLUMN_MAP)) {
          const raw = extractScalar(op[tag]);
          if (raw === null || raw === "") continue;
          try {
            cols.set(colId, new Decimal(raw));
            valuesCount++;
          } catch {
            warnings.push({
              code: "non_numeric_cell_value",
              message: `Valeur non numérique ${tag}=${raw} pour ${pseudoRubrique}`,
            });
          }
        }
        if (cols.size > 0) cellsInner.set(pseudoRubrique, cols);
      }
    }
  }

  if (rubriquesCount === 0) {
    warnings.push({
      code: "empty_annexe",
      message: `Aucune entrée trouvée dans ${normalizedAnnexe}`,
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
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (node as any)["#text"];
    if (text !== undefined) return String(text).trim() || null;
    return null;
  }
  return null;
}
