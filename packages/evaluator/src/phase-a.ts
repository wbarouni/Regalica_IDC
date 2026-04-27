/**
 * REGFlow — Phase A: parsing layer.
 *
 * Thin delegation wrapper around `parseBctBatch` from
 * `@regflow/bct-xml-parser`. The dual-nomenclature parser already owns
 * the parsing logic, the cell merge across files of a same batch, and
 * the per-file warning emission. Phase A re-exposes that boundary in
 * the contract the engine expects (array-shaped parsedXmls, flat
 * warnings) without adding any business logic of its own.
 */

import {
  parseBctBatch,
  type CellMatrix,
  type ParsedXml,
  type ParseWarning,
} from '@regflow/bct-xml-parser';

export interface PhaseAResult {
  readonly parsedXmls: readonly ParsedXml[];
  readonly mergedCells: CellMatrix;
  readonly warnings: readonly ParseWarning[];
}

export function parseBatch(xmlStrings: readonly string[]): PhaseAResult {
  const xmls = xmlStrings.map((content, index) => ({
    filename: `xml-${index}`,
    content,
  }));

  const { parsed, mergedCells } = parseBctBatch(xmls);

  const parsedXmls = Array.from(parsed.values());
  const warnings = parsedXmls.flatMap((p) => [...p.warnings]);

  return { parsedXmls, mergedCells, warnings };
}
