/**
 * REGFlow — BCT XML Parser
 *
 * Point d'entrée unique du dual-parser. Détecte la nomenclature, dispatch
 * vers le parser approprié, et retourne une structure unifiée `ParsedXml`.
 */

import type { ParsedXml } from "./types.js";
import { detectNomenclature } from "./nomenclature.js";
import { parseModern } from "./parser-modern.js";
import { parseLegacy } from "./parser-legacy.js";
import { parseSpecialized } from "./parser-specialized.js";

export * from "./types.js";
export { detectNomenclature, normalizeDate } from "./nomenclature.js";

/**
 * Parse un XML BCT, détection automatique de la nomenclature.
 *
 * @throws ParseError si le XML est inexploitable.
 */
export function parseBctXml(xmlContent: string): ParsedXml {
  const nomenclature = detectNomenclature(xmlContent);

  switch (nomenclature) {
    case "modern": {
      const r = parseModern(xmlContent);
      return {
        header: r.header,
        cells: r.cells,
        rawRubriquesCount: r.rubriquesCount,
        rawValuesCount: r.valuesCount,
        warnings: r.warnings,
      };
    }
    case "legacy": {
      const r = parseLegacy(xmlContent);
      return {
        header: r.header,
        cells: r.cells,
        rawRubriquesCount: r.rubriquesCount,
        rawValuesCount: r.valuesCount,
        warnings: r.warnings,
      };
    }
    case "specialized": {
      const r = parseSpecialized(xmlContent);
      return {
        header: r.header,
        cells: r.cells,
        rawRubriquesCount: r.rubriquesCount,
        rawValuesCount: r.valuesCount,
        warnings: r.warnings,
      };
    }
  }
}

/**
 * Parse plusieurs XML d'un batch et fusionne leurs CellMatrix.
 *
 * Les annexes doivent être distinctes entre fichiers (pas deux XML avec le même
 * codeAnnexe dans un même batch). Si collision, la dernière écrase, un warning
 * est émis.
 */
export function parseBctBatch(
  xmls: ReadonlyArray<{ filename: string; content: string }>,
): {
  parsed: ReadonlyMap<string, ParsedXml>;
  mergedCells: ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, import("decimal.js").default>>>;
} {
  const parsed = new Map<string, ParsedXml>();
  const merged = new Map<
    string,
    Map<string, Map<string, import("decimal.js").default>>
  >();

  for (const { filename, content } of xmls) {
    const p = parseBctXml(content);
    parsed.set(filename, p);

    const ann = p.header.codeAnnexe;
    const inner = p.cells.get(ann);
    if (!inner) continue;

    const mergedInner = merged.get(ann) ?? new Map();
    for (const [rub, cols] of inner.entries()) {
      const mergedCols = mergedInner.get(rub) ?? new Map();
      for (const [colId, val] of cols.entries()) {
        mergedCols.set(colId, val);
      }
      mergedInner.set(rub, mergedCols);
    }
    merged.set(ann, mergedInner);
  }

  return { parsed, mergedCells: merged };
}
