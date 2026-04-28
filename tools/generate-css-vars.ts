// Reads apps/web/src/tokens/tokens.json (single source of truth for the
// Edition One palette) and emits a CSS file declaring one custom
// property per color leaf + one per font family. The generated file
// is consumed by apps/web/src/index.css via @import, so primitives.css
// and any other raw-CSS rules can reference --marigold-50, --stone-700,
// etc., without ever hardcoding a hex value.
//
// Run via `pnpm generate:tokens` (root) or directly:
//   npx ts-node --project tools/tsconfig.generate-css-vars.json \
//               tools/generate-css-vars.ts
//
// Doctrine: zero invention. The script never types a hex literal —
// every value is read from tokens.json.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import tokens from '../apps/web/src/tokens/tokens.json';

type ColorTree = { [key: string]: string | ColorTree };

function flattenColors(obj: ColorTree, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const name = prefix ? `${prefix}-${key}` : key;
    if (typeof val === 'string') {
      result[name] = val;
    } else if (val && typeof val === 'object') {
      Object.assign(result, flattenColors(val, name));
    }
  }
  return result;
}

const colors = flattenColors(tokens.color as ColorTree);
const font = tokens.font as Record<string, string>;

let css = '/* AUTO-GENERATED from apps/web/src/tokens/tokens.json — do not edit. */\n';
css += '/* Regenerate with: pnpm generate:tokens */\n';
css += ':root {\n';

for (const [name, value] of Object.entries(colors)) {
  css += `  --${name}: ${value};\n`;
}

css += `  --font-sans: ${font['sans']};\n`;
css += `  --font-mono: ${font['mono']};\n`;
css += '}\n';

const outPath = resolve(__dirname, '../apps/web/src/styles/tokens.generated.css');
writeFileSync(outPath, css);

console.log(`Generated ${Object.keys(colors).length} color vars + 2 font vars -> ${outPath}`);
