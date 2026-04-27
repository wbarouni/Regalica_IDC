-- Migration 040_seed_colonnes.sql
-- Object: seed 408 BCT colonnes from referentials_colonnes.json
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 010_referentials_colonnes.sql, 010a_nullable_label_colonnes.sql,
--             010b_widen_colonnes_uk.sql, 003_tenants.sql, 004_users_roles.sql
-- References: Document 6 §9.1 (colonnes referential)
--
-- Source: tests/fixtures/rdg.xlsx via tools/ingest-rdg-xlsx/ingest.py.
-- 408 (annexe, colonne) pairs (44 distinct column numbers
-- C001..C044 reused across the 52 annexes).
-- label / data_type / semantic_label = NULL: no official source in
-- rdg.xlsx — TODO(@wbarouni)
-- status=draft — 4-eyes promotion required.
--
-- Required session vars:
--   app.seed_tenant_id        — UUID of the target tenant
--   app.seed_author_user_id   — UUID of the seeding user (author)
--   app.seed_valid_from       — TIMESTAMPTZ of bitemporal validity start
--
-- ON CONFLICT (tenant_id, annexe_code, code, valid_from) DO NOTHING — idempotent.
-- (010b widened the UK to include annexe_code; same column code
--  legitimately exists under multiple annexes.)

DO $$
DECLARE
  v_tenant_id  UUID;
  v_author_id  UUID;
  v_valid_from TIMESTAMPTZ;
  v_data       JSONB;
BEGIN

  IF current_setting('app.seed_tenant_id', true) IS NULL
  OR current_setting('app.seed_tenant_id', true) = ''
  OR current_setting('app.seed_author_user_id', true) IS NULL
  OR current_setting('app.seed_author_user_id', true) = ''
  OR current_setting('app.seed_valid_from', true) IS NULL
  OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration 040: session vars not set - skipping seed insert';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  v_data := $SEED_DATA$
[
  {
    "code": "C001",
    "label": null,
    "annexe_code": "00",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "00",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "00",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "00",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "00",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "00",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "00",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "00",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "01",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "01",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "01",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "01",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "01",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "100",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "100",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "100",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "100",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "100",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "100",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "100",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "100",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "100",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "100",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "100",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "100",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C013",
    "label": null,
    "annexe_code": "100",
    "column_number": 13,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "110",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "110",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "110",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "110",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "130",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "130",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "131",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "131",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "131",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "132",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "132",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "132",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "132",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "132",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "132",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "132",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "132",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "132",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "132",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "132",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "132",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "132",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "133",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "133",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "133",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "133",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "133",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "133",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "134",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "135",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "135",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "135",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "136",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "136",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "136",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "137",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "137",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "137",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "137",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "137",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "137",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "137",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "138",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "138",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "138",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "139",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "139",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "139",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "139",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "139",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "139",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "139",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "140",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "141",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "142",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "142",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "142",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "210",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "210",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "210",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "210",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "220",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "220",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "250",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "310",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "310",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "310",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "310",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "360",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "360",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "360",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "360",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "360",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "360",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "360",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "360",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "360",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "47",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "47",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "480",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "480",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "480",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "480",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "480",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "480",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "480",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "480",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "480",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "480",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "480",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "480",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C013",
    "label": null,
    "annexe_code": "480",
    "column_number": 13,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "480",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C015",
    "label": null,
    "annexe_code": "480",
    "column_number": 15,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C016",
    "label": null,
    "annexe_code": "480",
    "column_number": 16,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C017",
    "label": null,
    "annexe_code": "480",
    "column_number": 17,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C018",
    "label": null,
    "annexe_code": "480",
    "column_number": 18,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C019",
    "label": null,
    "annexe_code": "480",
    "column_number": 19,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C020",
    "label": null,
    "annexe_code": "480",
    "column_number": 20,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C021",
    "label": null,
    "annexe_code": "480",
    "column_number": 21,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C022",
    "label": null,
    "annexe_code": "480",
    "column_number": 22,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C023",
    "label": null,
    "annexe_code": "480",
    "column_number": 23,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C024",
    "label": null,
    "annexe_code": "480",
    "column_number": 24,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C025",
    "label": null,
    "annexe_code": "480",
    "column_number": 25,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C026",
    "label": null,
    "annexe_code": "480",
    "column_number": 26,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C027",
    "label": null,
    "annexe_code": "480",
    "column_number": 27,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C028",
    "label": null,
    "annexe_code": "480",
    "column_number": 28,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C029",
    "label": null,
    "annexe_code": "480",
    "column_number": 29,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C030",
    "label": null,
    "annexe_code": "480",
    "column_number": 30,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C031",
    "label": null,
    "annexe_code": "480",
    "column_number": 31,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C032",
    "label": null,
    "annexe_code": "480",
    "column_number": 32,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C033",
    "label": null,
    "annexe_code": "480",
    "column_number": 33,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C034",
    "label": null,
    "annexe_code": "480",
    "column_number": 34,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C035",
    "label": null,
    "annexe_code": "480",
    "column_number": 35,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C036",
    "label": null,
    "annexe_code": "480",
    "column_number": 36,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C037",
    "label": null,
    "annexe_code": "480",
    "column_number": 37,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C038",
    "label": null,
    "annexe_code": "480",
    "column_number": 38,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C039",
    "label": null,
    "annexe_code": "480",
    "column_number": 39,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C040",
    "label": null,
    "annexe_code": "480",
    "column_number": 40,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C041",
    "label": null,
    "annexe_code": "480",
    "column_number": 41,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C042",
    "label": null,
    "annexe_code": "480",
    "column_number": 42,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C043",
    "label": null,
    "annexe_code": "480",
    "column_number": 43,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C044",
    "label": null,
    "annexe_code": "480",
    "column_number": 44,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "481",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "481",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "481",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "481",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "481",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "481",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "481",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "481",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "482",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "482",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "482",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "482",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "482",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "482",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "482",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "482",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "482",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "482",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "482",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "482",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C013",
    "label": null,
    "annexe_code": "482",
    "column_number": 13,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "482",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C015",
    "label": null,
    "annexe_code": "482",
    "column_number": 15,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C016",
    "label": null,
    "annexe_code": "482",
    "column_number": 16,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C017",
    "label": null,
    "annexe_code": "482",
    "column_number": 17,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C018",
    "label": null,
    "annexe_code": "482",
    "column_number": 18,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C019",
    "label": null,
    "annexe_code": "482",
    "column_number": 19,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C020",
    "label": null,
    "annexe_code": "482",
    "column_number": 20,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C021",
    "label": null,
    "annexe_code": "482",
    "column_number": 21,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C022",
    "label": null,
    "annexe_code": "482",
    "column_number": 22,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C023",
    "label": null,
    "annexe_code": "482",
    "column_number": 23,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C024",
    "label": null,
    "annexe_code": "482",
    "column_number": 24,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C025",
    "label": null,
    "annexe_code": "482",
    "column_number": 25,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C026",
    "label": null,
    "annexe_code": "482",
    "column_number": 26,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C027",
    "label": null,
    "annexe_code": "482",
    "column_number": 27,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "483",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "483",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "483",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "483",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "483",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "483",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "483",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "483",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "483",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "483",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C013",
    "label": null,
    "annexe_code": "483",
    "column_number": 13,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "483",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C015",
    "label": null,
    "annexe_code": "483",
    "column_number": 15,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C016",
    "label": null,
    "annexe_code": "483",
    "column_number": 16,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C017",
    "label": null,
    "annexe_code": "483",
    "column_number": 17,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "484",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "484",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "484",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "484",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "484",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "484",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "484",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "484",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "484",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "484",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "485",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "485",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "485",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "485",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "485",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "485",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "485",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "485",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "485",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C015",
    "label": null,
    "annexe_code": "485",
    "column_number": 15,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C019",
    "label": null,
    "annexe_code": "485",
    "column_number": 19,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C021",
    "label": null,
    "annexe_code": "485",
    "column_number": 21,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C024",
    "label": null,
    "annexe_code": "485",
    "column_number": 24,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "51",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "510",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "510",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "510",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "510",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "510",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "510",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "510",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "510",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "510",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "510",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "520",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "520",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "520",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "520",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "520",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "520",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "520",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "520",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "520",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "520",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "530",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "530",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "530",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "530",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "530",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "530",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "530",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "530",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "530",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "530",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "540",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "540",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "540",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "540",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "540",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "540",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "550",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "550",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "550",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "550",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "550",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "560",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "560",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "560",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "560",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "560",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "620",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "620",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "620",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "620",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "620",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "630",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "630",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "630",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "630",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "630",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "630",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "630",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "630",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "630",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "630",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "630",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "630",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "640",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "640",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "640",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "640",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "640",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "640",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "640",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "640",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "640",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "640",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "640",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "720",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "720",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "730",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "730",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "730",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "740",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "740",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "740",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "740",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "740",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "740",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "740",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "740",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "740",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "740",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "740",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "740",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C013",
    "label": null,
    "annexe_code": "740",
    "column_number": 13,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "740",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C015",
    "label": null,
    "annexe_code": "740",
    "column_number": 15,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C016",
    "label": null,
    "annexe_code": "740",
    "column_number": 16,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C017",
    "label": null,
    "annexe_code": "740",
    "column_number": 17,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "750",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "750",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "750",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "750",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "750",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "750",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "750",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "750",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "750",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "750",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "760",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "820",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "820",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "830",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "830",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "830",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "830",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "830",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "830",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "830",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "830",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "830",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "830",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "830",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C013",
    "label": null,
    "annexe_code": "830",
    "column_number": 13,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "830",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C015",
    "label": null,
    "annexe_code": "830",
    "column_number": 15,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "840",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "840",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "840",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "840",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "840",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "840",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "840",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "840",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "840",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "840",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "840",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C013",
    "label": null,
    "annexe_code": "840",
    "column_number": 13,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "840",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C015",
    "label": null,
    "annexe_code": "840",
    "column_number": 15,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "850",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "850",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "850",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "850",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "850",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "850",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "850",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "850",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "850",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "850",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "850",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C013",
    "label": null,
    "annexe_code": "850",
    "column_number": 13,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "850",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C015",
    "label": null,
    "annexe_code": "850",
    "column_number": 15,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "860",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "860",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "860",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "860",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "860",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "860",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "860",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "860",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "860",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C011",
    "label": null,
    "annexe_code": "860",
    "column_number": 11,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C012",
    "label": null,
    "annexe_code": "860",
    "column_number": 12,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C013",
    "label": null,
    "annexe_code": "860",
    "column_number": 13,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C014",
    "label": null,
    "annexe_code": "860",
    "column_number": 14,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C015",
    "label": null,
    "annexe_code": "860",
    "column_number": 15,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "870",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "870",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "870",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "870",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "870",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "870",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "880",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "880",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "880",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "880",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C001",
    "label": null,
    "annexe_code": "910",
    "column_number": 1,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C002",
    "label": null,
    "annexe_code": "910",
    "column_number": 2,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C003",
    "label": null,
    "annexe_code": "910",
    "column_number": 3,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C004",
    "label": null,
    "annexe_code": "910",
    "column_number": 4,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C005",
    "label": null,
    "annexe_code": "910",
    "column_number": 5,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C006",
    "label": null,
    "annexe_code": "910",
    "column_number": 6,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C007",
    "label": null,
    "annexe_code": "910",
    "column_number": 7,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C008",
    "label": null,
    "annexe_code": "910",
    "column_number": 8,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C009",
    "label": null,
    "annexe_code": "910",
    "column_number": 9,
    "data_type": null,
    "semantic_label": null
  },
  {
    "code": "C010",
    "label": null,
    "annexe_code": "910",
    "column_number": 10,
    "data_type": null,
    "semantic_label": null
  }
]
$SEED_DATA$::JSONB;

  INSERT INTO referentials_colonnes (
    id, tenant_id, code, label, annexe_code,
    column_number, data_type, semantic_label,
    valid_from, author_user_id, status,
    created_at, updated_at
  )
  SELECT
    uuidv7(),
    v_tenant_id,
    r->>'code',
    NULL,
    r->>'annexe_code',
    (r->>'column_number')::INTEGER,
    NULL,
    NULL,
    v_valid_from,
    v_author_id,
    'draft',
    NOW(),
    NOW()
  FROM jsonb_array_elements(v_data) AS r
  ON CONFLICT (tenant_id, annexe_code, code, valid_from) DO NOTHING;
END $$;
