// Quick smoke test that runs the parser against all golden XMLs
// and verifies detection / extraction works for all nomenclatures.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseBctXml, detectNomenclature } from '../src/index.js';

const goldenDir = '/tmp/test_fixtures/golden/tenant-001';
const structRefsDir = '/tmp/test_fixtures/structural-references';

function findAllXmls(dir: string): string[] {
  const out: string[] = [];
  function walk(p: string): void {
    const entries = fs.readdirSync(p, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else if (full.endsWith('.xml') || full.endsWith('.XML')) out.push(full);
    }
  }
  walk(dir);
  return out.sort();
}

interface Stats {
  modern: number;
  legacy: number;
  specialized: number;
  parse_errors: string[];
  total_rubriques: number;
  total_values: number;
  per_file: Array<{
    file: string;
    annexe: string;
    date: string;
    nomenclature: string;
    rubs: number;
    vals: number;
    warns: number;
  }>;
}

function runTest(): Stats {
  const xmls = [...findAllXmls(goldenDir), ...findAllXmls(structRefsDir)];
  console.log(`Found ${xmls.length} XML files`);

  const stats: Stats = {
    modern: 0,
    legacy: 0,
    specialized: 0,
    parse_errors: [],
    total_rubriques: 0,
    total_values: 0,
    per_file: [],
  };

  for (const xmlPath of xmls) {
    const content = fs.readFileSync(xmlPath, 'utf-8');
    const nomen = detectNomenclature(content);

    try {
      const parsed = parseBctXml(content);
      if (nomen === 'modern') stats.modern++;
      else if (nomen === 'legacy') stats.legacy++;
      else if (nomen === 'specialized') stats.specialized++;

      stats.total_rubriques += parsed.rawRubriquesCount;
      stats.total_values += parsed.rawValuesCount;

      stats.per_file.push({
        file: path.basename(xmlPath),
        annexe: parsed.header.codeAnnexe,
        date: parsed.header.dateAnnexe,
        nomenclature: parsed.header.nomenclature,
        rubs: parsed.rawRubriquesCount,
        vals: parsed.rawValuesCount,
        warns: parsed.warnings.length,
      });
    } catch (err) {
      stats.parse_errors.push(`${path.basename(xmlPath)}: ${(err as Error).message}`);
    }
  }

  return stats;
}

const stats = runTest();
console.log(`\n=== Summary ===`);
console.log(`Modern XMLs parsed: ${stats.modern}`);
console.log(`Legacy XMLs parsed: ${stats.legacy}`);
console.log(`Specialized XMLs parsed: ${stats.specialized}`);
console.log(`Total: ${stats.modern + stats.legacy + stats.specialized}`);
console.log(`Parse errors: ${stats.parse_errors.length}`);
console.log(`Total rubriques extracted: ${stats.total_rubriques}`);
console.log(`Total values extracted: ${stats.total_values}`);

if (stats.parse_errors.length > 0) {
  console.log(`\nErrors:`);
  for (const err of stats.parse_errors) console.log(`  - ${err}`);
}

console.log(`\n=== Per file (sample) ===`);
// Print 10 samples covering modern, legacy, specialized
const samples = stats.per_file.slice(0, 20);
for (const s of samples) {
  console.log(
    `  ${s.annexe.padEnd(5)} [${s.nomenclature.padEnd(11)}] ${s.date.padEnd(10)} ` +
      `rubs=${String(s.rubs).padStart(3)} vals=${String(s.vals).padStart(5)} ` +
      `warns=${s.warns} ${s.file}`,
  );
}
// Also print legacy and specialized entries
for (const s of stats.per_file) {
  if (s.nomenclature !== 'modern') {
    console.log(
      `  ${s.annexe.padEnd(5)} [${s.nomenclature.padEnd(11)}] ${s.date.padEnd(10)} ` +
        `rubs=${String(s.rubs).padStart(3)} vals=${String(s.vals).padStart(5)} ` +
        `warns=${s.warns} ${s.file}`,
    );
  }
}
