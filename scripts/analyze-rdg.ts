// scripts/analyze-rdg.ts
// Usage: tsx scripts/analyze-rdg.ts ./tests/fixtures/RDG.xlsx

import * as ExcelJS from 'exceljs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
interface AnalysisReport {
  meta: {
    filePath: string;
    analyzedAt: string;
    fileSize: number;
  };
  structure: {
    sheets: string[];
    primarySheet: string;
    totalRows: number;
    totalColumns: number;
    headers: string[];
    headerTypes: Record<string, string>;
  };
  rules: {
    uniqueRulesCount: number;
    totalLines: number;
    avgLinesPerRule: number;
    minLinesPerRule: number;
    maxLinesPerRule: number;
    distributionByLinesPerRule: Record<number, number>;
  };
  annexes: {
    totalAnnexes: number;
    list: Array<{ code: string; rulesCount: number; linesCount: number }>;
  };
  ruleTypes: Record<string, number>;
  severity: Record<string, number>;
  scope: { intra: number; inter: number; unknown: number };
  rubriques: {
    totalUnique: number;
    topUsed: Array<{ code: string; occurrences: number }>;
    categoriesDetected: string[];
    hierarchyDepthDistribution: Record<number, number>;
  };
  columns: {
    minColumnNumber: number;
    maxColumnNumber: number;
    distributionByAnnexe: Record<string, number[]>;
  };
  operators: Record<string, number>;
  samples: {
    simpleEquality: any[];
    sumRule: any[];
    conditionalRule: any[];
    crossAnnexeRule: any[];
    complexRule: any[];
  };
  anomalies: {
    incompleteLines: number;
    orphanLines: number;
    duplicateRuleIds: string[];
    unknownRuleTypes: string[];
    invalidRubriqueCodes: string[];
    rulesWithoutSource: number;
  };
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function analyzeRDG(filePath: string): Promise<AnalysisReport> {
  console.log(`\n🔍 Analyse du fichier : ${filePath}\n`);

  const stat = await fs.stat(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const report: AnalysisReport = {
    meta: {
      filePath,
      analyzedAt: new Date().toISOString(),
      fileSize: stat.size,
    },
    structure: {
      sheets: workbook.worksheets.map(ws => ws.name),
      primarySheet: '',
      totalRows: 0,
      totalColumns: 0,
      headers: [],
      headerTypes: {},
    },
    rules: {
      uniqueRulesCount: 0,
      totalLines: 0,
      avgLinesPerRule: 0,
      minLinesPerRule: Infinity,
      maxLinesPerRule: 0,
      distributionByLinesPerRule: {},
    },
    annexes: { totalAnnexes: 0, list: [] },
    ruleTypes: {},
    severity: {},
    scope: { intra: 0, inter: 0, unknown: 0 },
    rubriques: {
      totalUnique: 0,
      topUsed: [],
      categoriesDetected: [],
      hierarchyDepthDistribution: {},
    },
    columns: {
      minColumnNumber: Infinity,
      maxColumnNumber: 0,
      distributionByAnnexe: {},
    },
    operators: {},
    samples: {
      simpleEquality: [],
      sumRule: [],
      conditionalRule: [],
      crossAnnexeRule: [],
      complexRule: [],
    },
    anomalies: {
      incompleteLines: 0,
      orphanLines: 0,
      duplicateRuleIds: [],
      unknownRuleTypes: [],
      invalidRubriqueCodes: [],
      rulesWithoutSource: 0,
    },
    recommendations: [],
  };

  // Sélectionner la feuille principale (première ou la plus grande)
  const primarySheet = workbook.worksheets.reduce((a, b) =>
    (b.rowCount > a.rowCount ? b : a)
  );
  report.structure.primarySheet = primarySheet.name;
  report.structure.totalRows = primarySheet.rowCount;
  report.structure.totalColumns = primarySheet.columnCount;

  console.log(`📊 Feuille analysée : "${primarySheet.name}"`);
  console.log(`   Lignes : ${primarySheet.rowCount}`);
  console.log(`   Colonnes : ${primarySheet.columnCount}\n`);

  // ─────────────────────────────────────────────────────────────
  // Extraction des en-têtes (ligne 1)
  // ─────────────────────────────────────────────────────────────
  const headerRow = primarySheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const value = String(cell.value ?? '').trim();
    headers[colNumber - 1] = value;
  });
  report.structure.headers = headers;

  console.log(`📋 En-têtes détectés :`);
  headers.forEach((h, i) => console.log(`   Col ${i + 1}: "${h}"`));
  console.log('');

  // ─────────────────────────────────────────────────────────────
  // Détection automatique des colonnes clés
  // ─────────────────────────────────────────────────────────────
  const colIdx = detectKeyColumns(headers);
  console.log(`🔑 Colonnes clés détectées :`);
  Object.entries(colIdx).forEach(([key, idx]) => {
    console.log(`   ${key}: col ${idx + 1} ("${headers[idx]}")`);
  });
  console.log('');

  // ─────────────────────────────────────────────────────────────
  // Parsing de toutes les lignes
  // ─────────────────────────────────────────────────────────────
  const allLines: any[] = [];
  const ruleLines: Map<string, any[]> = new Map();

  for (let rowIdx = 2; rowIdx <= primarySheet.rowCount; rowIdx++) {
    const row = primarySheet.getRow(rowIdx);
    if (row.cellCount === 0) continue;

    const lineData: any = { _row: rowIdx };
    headers.forEach((header, i) => {
      const cell = row.getCell(i + 1);
      let value = cell.value;
      if (value && typeof value === 'object' && 'text' in (value as any)) {
        value = (value as any).text;
      }
      lineData[header] = value;
    });

    allLines.push(lineData);

    // Regrouper par rule_id
    const ruleId = getRuleId(lineData, colIdx);
    if (ruleId) {
      if (!ruleLines.has(ruleId)) ruleLines.set(ruleId, []);
      ruleLines.get(ruleId)!.push(lineData);
    } else {
      report.anomalies.orphanLines++;
    }
  }

  report.rules.totalLines = allLines.length;
  report.rules.uniqueRulesCount = ruleLines.size;
  report.rules.avgLinesPerRule = allLines.length / ruleLines.size;

  // Distribution lignes par règle
  const lineCounts: number[] = [];
  ruleLines.forEach((lines) => {
    const count = lines.length;
    lineCounts.push(count);
    report.rules.minLinesPerRule = Math.min(report.rules.minLinesPerRule, count);
    report.rules.maxLinesPerRule = Math.max(report.rules.maxLinesPerRule, count);
    report.rules.distributionByLinesPerRule[count] =
      (report.rules.distributionByLinesPerRule[count] ?? 0) + 1;
  });

  console.log(`📏 Statistiques des règles :`);
  console.log(`   Règles uniques : ${report.rules.uniqueRulesCount}`);
  console.log(`   Lignes totales : ${report.rules.totalLines}`);
  console.log(`   Moyenne lignes/règle : ${report.rules.avgLinesPerRule.toFixed(2)}`);
  console.log(`   Min/Max lignes/règle : ${report.rules.minLinesPerRule} / ${report.rules.maxLinesPerRule}\n`);

  // ─────────────────────────────────────────────────────────────
  // Analyse par annexe
  // ─────────────────────────────────────────────────────────────
  const annexeStats: Map<string, { rules: Set<string>; lines: number }> = new Map();
  allLines.forEach((line) => {
    const annexe = String(line[headers[colIdx.annexe]] ?? '').trim();
    if (!annexe) return;
    if (!annexeStats.has(annexe)) {
      annexeStats.set(annexe, { rules: new Set(), lines: 0 });
    }
    const stat = annexeStats.get(annexe)!;
    stat.lines++;
    const ruleId = getRuleId(line, colIdx);
    if (ruleId) stat.rules.add(ruleId);
  });

  report.annexes.totalAnnexes = annexeStats.size;
  report.annexes.list = Array.from(annexeStats.entries())
    .map(([code, stat]) => ({
      code,
      rulesCount: stat.rules.size,
      linesCount: stat.lines,
    }))
    .sort((a, b) => b.rulesCount - a.rulesCount);

  console.log(`📁 Annexes détectées : ${report.annexes.totalAnnexes}`);
  report.annexes.list.slice(0, 10).forEach((a) => {
    console.log(`   Annexe ${a.code} : ${a.rulesCount} règles / ${a.linesCount} lignes`);
  });
  if (report.annexes.list.length > 10) {
    console.log(`   ... et ${report.annexes.list.length - 10} autres annexes`);
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────
  // Analyse des rubriques
  // ─────────────────────────────────────────────────────────────
  const rubriqueOccurrences: Map<string, number> = new Map();
  const categoriesDetected: Set<string> = new Set();

  allLines.forEach((line) => {
    const rubrique = String(line[headers[colIdx.rubrique]] ?? '').trim();
    if (!rubrique) return;
    rubriqueOccurrences.set(rubrique, (rubriqueOccurrences.get(rubrique) ?? 0) + 1);

    // Extraire catégorie (2 premiers caractères)
    if (rubrique.length >= 2 && /^[A-Z]{2}/.test(rubrique)) {
      categoriesDetected.add(rubrique.substring(0, 2));
    }

    // Validation format BCT (2 lettres + 12 chiffres)
    if (rubrique && !/^[A-Z]{2}\d{12}$/.test(rubrique)) {
      report.anomalies.invalidRubriqueCodes.push(rubrique);
    }
  });

  report.rubriques.totalUnique = rubriqueOccurrences.size;
  report.rubriques.categoriesDetected = Array.from(categoriesDetected).sort();
  report.rubriques.topUsed = Array.from(rubriqueOccurrences.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([code, occurrences]) => ({ code, occurrences }));

  console.log(`🏷️  Rubriques :`);
  console.log(`   Uniques : ${report.rubriques.totalUnique}`);
  console.log(`   Catégories détectées : ${report.rubriques.categoriesDetected.join(', ')}`);
  console.log(`   Top 5 les plus utilisées :`);
  report.rubriques.topUsed.slice(0, 5).forEach((r) => {
    console.log(`      ${r.code} : ${r.occurrences} occurrences`);
  });
  console.log('');

  // ─────────────────────────────────────────────────────────────
  // Analyse des colonnes numériques (col 5, col 8...)
  // ─────────────────────────────────────────────────────────────
  if (colIdx.colonne !== undefined) {
    allLines.forEach((line) => {
      const colNum = Number(line[headers[colIdx.colonne]]);
      const annexe = String(line[headers[colIdx.annexe]] ?? '').trim();
      if (!isNaN(colNum) && annexe) {
        report.columns.minColumnNumber = Math.min(report.columns.minColumnNumber, colNum);
        report.columns.maxColumnNumber = Math.max(report.columns.maxColumnNumber, colNum);
        if (!report.columns.distributionByAnnexe[annexe]) {
          report.columns.distributionByAnnexe[annexe] = [];
        }
        if (!report.columns.distributionByAnnexe[annexe].includes(colNum)) {
          report.columns.distributionByAnnexe[annexe].push(colNum);
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Analyse des opérateurs
  // ─────────────────────────────────────────────────────────────
  if (colIdx.operator !== undefined) {
    allLines.forEach((line) => {
      const op = String(line[headers[colIdx.operator]] ?? '').trim();
      if (op) report.operators[op] = (report.operators[op] ?? 0) + 1;
    });
  }

  console.log(`⚙️  Opérateurs détectés :`);
  Object.entries(report.operators)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([op, count]) => {
      console.log(`   "${op}" : ${count} occurrences`);
    });
  console.log('');

  // ─────────────────────────────────────────────────────────────
  // Échantillons représentatifs
  // ─────────────────────────────────────────────────────────────
  const simpleRules = Array.from(ruleLines.entries()).filter(([, lines]) => lines.length === 2);
  const sumRules = Array.from(ruleLines.entries()).filter(
    ([, lines]) => lines.length >= 3 && lines.length <= 5
  );
  const complexRules = Array.from(ruleLines.entries()).filter(([, lines]) => lines.length > 10);

  report.samples.simpleEquality = simpleRules.slice(0, 3).map(([, lines]) => lines);
  report.samples.sumRule = sumRules.slice(0, 3).map(([, lines]) => lines);
  report.samples.complexRule = complexRules.slice(0, 3).map(([, lines]) => lines);

  // ─────────────────────────────────────────────────────────────
  // Recommandations automatiques
  // ─────────────────────────────────────────────────────────────
  generateRecommendations(report);

  return report;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function detectKeyColumns(headers: string[]): Record<string, number> {
  const colIdx: Record<string, number> = {};
  const patterns: Record<string, RegExp[]> = {
    rule_id: [/rule[_\s]?id/i, /id[_\s]?regle/i, /n[°o][_\s]?r[èe]gle/i, /code[_\s]?r[èe]gle/i],
    annexe: [/annexe/i, /annex/i],
    scope: [/scope/i, /port[ée]e/i, /intra|inter/i],
    rule_type: [/type/i, /kind/i, /nature/i],
    role: [/role/i, /r[ôo]le/i, /side/i, /membre/i],
    rubrique: [/rubrique/i, /code[_\s]?rubrique/i, /rubric/i],
    colonne: [/colonne/i, /col\b/i, /column/i],
    operator: [/operator/i, /op[ée]rateur/i, /op\b/i],
    severity: [/severity/i, /s[ée]v[ée]rit[ée]/i, /gravit[ée]/i],
    description: [/description/i, /libell[ée]/i, /label/i],
    source: [/source/i, /circulaire/i, /r[ée]f[ée]rence/i],
  };

  for (const [key, regexes] of Object.entries(patterns)) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (h && regexes.some((r) => r.test(h))) {
        colIdx[key] = i;
        break;
      }
    }
  }
  return colIdx;
}

function getRuleId(line: any, colIdx: Record<string, number>): string | null {
  if (colIdx.rule_id === undefined) return null;
  const headers = Object.keys(line).filter((k) => k !== '_row');
  const value = line[headers[colIdx.rule_id]];
  return value ? String(value).trim() : null;
}

function generateRecommendations(report: AnalysisReport): void {
  const recs = report.recommendations;

  if (report.anomalies.orphanLines > 0) {
    recs.push(
      `⚠️ ${report.anomalies.orphanLines} lignes orphelines (sans rule_id) détectées. ` +
      `À nettoyer avant import en production.`
    );
  }

  if (report.anomalies.invalidRubriqueCodes.length > 0) {
    recs.push(
      `⚠️ ${report.anomalies.invalidRubriqueCodes.length} codes rubriques au format non-standard BCT. ` +
      `Vérifier : ${report.anomalies.invalidRubriqueCodes.slice(0, 3).join(', ')}`
    );
  }

  if (report.rules.maxLinesPerRule > 20) {
    recs.push(
      `ℹ️ Certaines règles ont plus de 20 lignes (max: ${report.rules.maxLinesPerRule}). ` +
      `Vérifier que l'AST cible supporte la complexité (agrégations profondes).`
    );
  }

  if (report.annexes.totalAnnexes < 5) {
    recs.push(
      `⚠️ Seulement ${report.annexes.totalAnnexes} annexe(s) détectée(s). ` +
      `Vérifier si la colonne annexe est correctement identifiée.`
    );
  }

  if (report.rubriques.categoriesDetected.length === 0) {
    recs.push(
      `❌ Aucune catégorie BCT (AC, PA, HB...) détectée dans les rubriques. ` +
      `Le format pourrait être différent de l'hypothèse. Vérifier colonne rubrique.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// EXECUTION
// ═══════════════════════════════════════════════════════════════
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: tsx scripts/analyze-rdg.ts <path-to-xlsx>');
    process.exit(1);
  }

  try {
    const report = await analyzeRDG(filePath);

    // Sauvegarde JSON
    const outDir = path.join(process.cwd(), 'docs', 'analysis');
    await fs.mkdir(outDir, { recursive: true });
    const jsonPath = path.join(outDir, 'rdg-analysis.json');
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n✅ Rapport JSON : ${jsonPath}`);

    // Génération Markdown
    const md = renderMarkdownReport(report);
    const mdPath = path.join(outDir, 'rdg-analysis.md');
    await fs.writeFile(mdPath, md, 'utf-8');
    console.log(`✅ Rapport Markdown : ${mdPath}\n`);

    // Recommandations finales
    if (report.recommendations.length > 0) {
      console.log(`\n📝 Recommandations (${report.recommendations.length}) :`);
      report.recommendations.forEach((r) => console.log(`   ${r}`));
    }
  } catch (err) {
    console.error('❌ Erreur :', err);
    process.exit(1);
  }
}

function renderMarkdownReport(r: AnalysisReport): string {
  return `# Analyse RDG — Rapport Automatique

**Généré le :** ${r.meta.analyzedAt}
**Fichier :** \`${r.meta.filePath}\`
**Taille :** ${(r.meta.fileSize / 1024).toFixed(1)} KB

## Structure

- **Feuilles :** ${r.structure.sheets.join(', ')}
- **Feuille principale :** ${r.structure.primarySheet}
- **Lignes :** ${r.structure.totalRows}
- **Colonnes :** ${r.structure.totalColumns}
- **En-têtes :** ${r.structure.headers.map((h) => `\`${h}\``).join(', ')}

## Règles

- **Règles uniques :** ${r.rules.uniqueRulesCount}
- **Lignes totales :** ${r.rules.totalLines}
- **Moyenne lignes/règle :** ${r.rules.avgLinesPerRule.toFixed(2)}
- **Min/Max :** ${r.rules.minLinesPerRule} / ${r.rules.maxLinesPerRule}

## Annexes

${r.annexes.list.map((a) => `- **Annexe ${a.code}** : ${a.rulesCount} règles / ${a.linesCount} lignes`).join('\n')}

## Rubriques

- **Uniques :** ${r.rubriques.totalUnique}
- **Catégories BCT détectées :** ${r.rubriques.categoriesDetected.join(', ')}

### Top 20 rubriques les plus utilisées

${r.rubriques.topUsed.map((rb) => `- \`${rb.code}\` : ${rb.occurrences} occurrences`).join('\n')}

## Opérateurs

${Object.entries(r.operators)
  .sort((a, b) => b[1] - a[1])
  .map(([op, c]) => `- \`${op}\` : ${c}`)
  .join('\n')}

## Anomalies

- **Lignes orphelines :** ${r.anomalies.orphanLines}
- **Codes rubriques invalides :** ${r.anomalies.invalidRubriqueCodes.length}
- **Règles sans source :** ${r.anomalies.rulesWithoutSource}

## Recommandations

${r.recommendations.map((rec) => `- ${rec}`).join('\n')}
`;
}

main();
