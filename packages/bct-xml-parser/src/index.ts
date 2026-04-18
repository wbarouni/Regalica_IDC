/**
 * BCT XML parser — placeholder for Phase 1.
 *
 * Target behaviour:
 * 1. Streaming parse of an annexe XML (multi-MB possible).
 * 2. Produce a typed `RubriqueValue[]` stream keyed by rubrique code.
 * 3. Preserve bit-identical numeric representation (Decimal 38 digits).
 *
 * The 5 golden fixtures at
 *   `tests/fixtures/golden/bank-23/2024-03-31/`
 * are the reference: parsing + evaluation must reproduce the 1 014 PASS /
 * 3 FAIL verdicts documented in master doc §1.4 (Preuve terrain v1.1).
 */

export const BCT_XML_PARSER_VERSION = '0.0.0-placeholder' as const;
