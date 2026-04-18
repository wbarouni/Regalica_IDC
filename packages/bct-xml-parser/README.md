# @regalica/bct-xml-parser

**Status:** Placeholder — implemented in Phase 1.

## Purpose

Parses the BCT XML reporting format into a normalised stream of `RubriqueValue`
entries that the evaluator (`apps/api/src/agents/evaluator.ts`) can group,
aggregate, and compare against the RDG rules.

Must preserve bit-identical numeric representation (decimal 38 digits) — no
IEEE-754 conversion anywhere in the path from XML bytes to verdict.

## Test corpus

Located at `tests/fixtures/golden/bank-23/2024-03-31/`:

- `00-2024-03-31.XML` (64 KB) — main annexe
- `01-2024-03-31.XML` (26 KB)
- `02-2024-03-31.XML` (155 B)
- `51-2024-03-31.XML` (22 KB)
- `640-2024-03-31.XML` (1.7 KB)

The expected verdicts live in `tests/fixtures/expected-verdicts/` (to be
populated in Phase 1 from the RDG.xlsx reference run).
