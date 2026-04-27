/**
 * Integration test for Phase A wrapper.
 *
 * Loads a real golden XML from tests/fixtures/golden/tenant-001 and
 * asserts that parseBatch returns the contract shape expected by the
 * engine (array of ParsedXml, non-empty CellMatrix, flat warnings).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseBatch } from '../src/phase-a.js';

const GOLDEN_XML = resolve(
  __dirname,
  '../../../tests/fixtures/golden/tenant-001/2024-09-30/filled/139-2024-09-30.xml',
);

describe('phase-a — parseBatch()', () => {
  it('parses a single golden XML and returns a non-empty result', () => {
    const content = readFileSync(GOLDEN_XML, 'utf8');
    const result = parseBatch([content]);

    expect(result.parsedXmls.length).toBe(1);
    expect(result.mergedCells).toBeInstanceOf(Map);
    expect(result.mergedCells.size).toBeGreaterThan(0);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('preserves input order in parsedXmls', () => {
    const content = readFileSync(GOLDEN_XML, 'utf8');
    const result = parseBatch([content, content]);

    expect(result.parsedXmls.length).toBe(2);
    expect(result.parsedXmls[0]!.header.codeAnnexe).toBe(result.parsedXmls[1]!.header.codeAnnexe);
  });

  it('returns mergedCells keyed by codeAnnexe', () => {
    const content = readFileSync(GOLDEN_XML, 'utf8');
    const result = parseBatch([content]);

    const codeAnnexe = result.parsedXmls[0]!.header.codeAnnexe;
    expect(result.mergedCells.has(codeAnnexe)).toBe(true);
  });

  it('returns an empty result for an empty input array', () => {
    const result = parseBatch([]);
    expect(result.parsedXmls).toEqual([]);
    expect(result.mergedCells.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });
});
