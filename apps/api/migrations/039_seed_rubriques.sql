-- Migration 039_seed_rubriques.sql
-- Object: seed 1103 BCT rubriques from referentials_rubriques.json
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 009_referentials_rubriques.sql, 009a_nullable_label_rubriques.sql,
--             009b_widen_rubriques_uk.sql, 003_tenants.sql, 004_users_roles.sql
-- References: Document 6 §9.1 (rubriques referential)
--
-- Source: tests/fixtures/rdg.xlsx via tools/ingest-rdg-xlsx/ingest.py.
-- 1103 (annexe, rubrique) pairs (831 distinct rubrique codes,
-- some reused in up to 8 annexes).
-- label=NULL: no official label source in rdg.xlsx — TODO(@wbarouni)
-- status=draft — 4-eyes promotion required.
--
-- Required session vars (set by operator or test harness BEFORE
-- applying this migration):
--   app.seed_tenant_id        — UUID of the target tenant
--   app.seed_author_user_id   — UUID of the seeding user (author)
--   app.seed_valid_from       — TIMESTAMPTZ of bitemporal validity start
--
-- ON CONFLICT (tenant_id, annexe_code, code, valid_from) DO NOTHING — idempotent.
-- (009b widened the UK to include annexe_code; same rubrique code may
--  legitimately exist under multiple annexes.)

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
    RAISE NOTICE 'migration 039: session vars not set - skipping seed insert';
    RETURN;
  END IF;

  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  v_data := $SEED_DATA$
[
  {
    "code": "AC010000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010101000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010102000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010301000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010302000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010400000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010401000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010402000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010409000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020101000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020101010000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020101020000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020101020100",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020101020200",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020101090000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020102000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020102010000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020102010100",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020102010200",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020102010900",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020102020000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020102020100",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020102020200",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020102020900",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030400000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030500000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030600000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030700000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030800000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030900000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030901000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030902000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030903000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC031000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC031100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC031200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC031900000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040101000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040102000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040103000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040104000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040105000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040106000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040109000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040201000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040202000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040203000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040204000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040205000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040206000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040209000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050101000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050102000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050103000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050104000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050105000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050109000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050201000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050202000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050400000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC060000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC060100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC060200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070400000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070500000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070600000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070700000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070800000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070900000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC990000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP010000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP010100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP010200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020400000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020500000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020600000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020900000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP030000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040400000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040500000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040600000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040900000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP050000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP050100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP050200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP060000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP070000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP990000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010301000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010301010000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010301020000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010301030000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010309000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101010000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101020000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101020100",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101020200",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101090000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102010000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102010100",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102010200",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102010900",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102020000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102020100",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102020200",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102020900",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020201000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020202000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030201000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030202000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030400000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030900000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040101000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040102000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040103000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040109000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040201000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040209000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040301000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040302000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050100000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050200000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050300000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050400000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050500000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050600000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050900000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA300000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA301000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA302000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA303000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA304000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA309000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA990000000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PACP9900000000",
    "label": null,
    "annexe_code": "00",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010000000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010100000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010101000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010101010000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010101020000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010101020100",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010101020200",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010102000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010200000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010201000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010202000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010203000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010204000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB010209000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB020000000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB020100000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB020101000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB020102000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB020200000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB020201000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB020202000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB030000000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB030100000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB030200000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB030900000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040000000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040100000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040101000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040101010000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040101020000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040101020100",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040101020200",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040102000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040200000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040201000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB040209000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB050000000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB050100000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB050200000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB050300000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB060000000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB060100000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB060101000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB060102000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB060102010000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB060102020000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB060200000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070000000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070100000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070200000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070201000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070201010000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070201010100",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070201010200",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070201010201",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070201010202",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070201020000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070202000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070202010000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070202010100",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070202010200",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070202010201",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070202010202",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070202020000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070300000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070400000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070500000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070600000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070601000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070602000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070603000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070604000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB070609000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080100000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080101000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080102000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080103000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080104000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080200000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080201000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080201010000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080201020000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080201030000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080201040000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080202000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080203000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080204000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080205000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080300000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080301000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080302000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080303000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HB080309000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HBED9900000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HBER0900000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HBER0901000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HBER0902000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "HBPE9900000000",
    "label": null,
    "annexe_code": "01",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "10001010000000",
    "label": null,
    "annexe_code": "100",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "10001010100000",
    "label": null,
    "annexe_code": "100",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "10001010200000",
    "label": null,
    "annexe_code": "100",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "10001020000000",
    "label": null,
    "annexe_code": "100",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "10001020100000",
    "label": null,
    "annexe_code": "100",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "10001020200000",
    "label": null,
    "annexe_code": "100",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "10002000000000",
    "label": null,
    "annexe_code": "100",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "10099000000000",
    "label": null,
    "annexe_code": "100",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "11001010000000",
    "label": null,
    "annexe_code": "110",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "11001020000000",
    "label": null,
    "annexe_code": "110",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "11002010000000",
    "label": null,
    "annexe_code": "110",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001010000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001010100000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001010200000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001010300000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001010400000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001010500000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001010600000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001010700000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001019000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001019010000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001019020000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001019030000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001019040000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001019050000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001019060000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001019070000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001019080000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001020000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030100000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030101000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030102000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030103000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030104000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030105000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030190000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030190100",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030200000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030201000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030290000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030290100",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001040000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP010100000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP010200000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020100000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020200000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020300000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020400000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020500000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020600000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP020900000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040200000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040300000000",
    "label": null,
    "annexe_code": "130",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001020000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030100000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001030200000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13001040000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002010000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002020000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002020100000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002020200000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002030000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040100000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040101000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040102000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040200000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040300000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040301000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040302000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040303000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040304000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002050000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002060000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002070000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006590000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006690000000",
    "label": null,
    "annexe_code": "131",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040101000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003010000000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003020000000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003030000000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003040000000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050000000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050100000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050101000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050101010",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050101020",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050101021",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050101022",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050101030",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050101040",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050101050",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050101060",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050102000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050102010",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050102020",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050200000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050201000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050201010",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050201020",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050201030",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050201031",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050201032",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050201040",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050201050",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050201060",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050202000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050202010",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050202020",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050202030",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050202040",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050203000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050203010",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050203020",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050203021",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050203022",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003050204000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003060000000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003060100000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003060101000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003060102000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003060200000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003060201000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003060202000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003060203000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070000000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070100000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070101000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070101010",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070101020",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070102000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070102010",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070102020",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070200000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070201000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070202000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070202010",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070202020",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070203000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003070204000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003080000000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003080100000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003080200000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003080300000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003080400000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003080500000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003080600000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13003090000000",
    "label": null,
    "annexe_code": "132",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040102000",
    "label": null,
    "annexe_code": "133",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13004010000000",
    "label": null,
    "annexe_code": "133",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13002040200000",
    "label": null,
    "annexe_code": "134",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13005010000000",
    "label": null,
    "annexe_code": "134",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13005020000000",
    "label": null,
    "annexe_code": "134",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13005030000000",
    "label": null,
    "annexe_code": "134",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13005040000000",
    "label": null,
    "annexe_code": "134",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13005050000000",
    "label": null,
    "annexe_code": "134",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13005060000000",
    "label": null,
    "annexe_code": "134",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006010000000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006010100000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006010101000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006010102000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006010200000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006010201000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006010202000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006010300000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006010400000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006020000000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006106000000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006340000000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006350000000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006499900000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13007090000000",
    "label": null,
    "annexe_code": "135",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006101000000",
    "label": null,
    "annexe_code": "136",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006102000000",
    "label": null,
    "annexe_code": "136",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006103000000",
    "label": null,
    "annexe_code": "136",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006104000000",
    "label": null,
    "annexe_code": "136",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006105000000",
    "label": null,
    "annexe_code": "136",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006106000000",
    "label": null,
    "annexe_code": "136",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006210000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006210100000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006210200000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006210300000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006210400000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006211000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006212000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006213000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006214000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006215000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006216000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006217000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006218000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006219000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006220000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006220100000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006220200000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006220300000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006230000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006230100000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006230200000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006230300000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006230400000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006230500000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006230600000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006230700000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006230800000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006240000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006250000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006260000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006270000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006280000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006290000000",
    "label": null,
    "annexe_code": "137",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006310000000",
    "label": null,
    "annexe_code": "138",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006320000000",
    "label": null,
    "annexe_code": "138",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006330000000",
    "label": null,
    "annexe_code": "138",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006340000000",
    "label": null,
    "annexe_code": "138",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006350000000",
    "label": null,
    "annexe_code": "138",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "EM000000000000",
    "label": null,
    "annexe_code": "138",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006410000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006420000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006430000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006440000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006450000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006460000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006470000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006480000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006490000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006499000000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006499900000",
    "label": null,
    "annexe_code": "139",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006590000000",
    "label": null,
    "annexe_code": "140",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006610000000",
    "label": null,
    "annexe_code": "141",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006610200000",
    "label": null,
    "annexe_code": "141",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006620000000",
    "label": null,
    "annexe_code": "141",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006620200000",
    "label": null,
    "annexe_code": "141",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13006690000000",
    "label": null,
    "annexe_code": "141",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "13007090000000",
    "label": null,
    "annexe_code": "142",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21001000000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21001010000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21001010100000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21001010101000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21001010102000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21001010200000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21001010201000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21001010202000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21001020000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21002000000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21002010000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21002020000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21003000000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21004000000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21010010000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21010020000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "21099000000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP010000000000",
    "label": null,
    "annexe_code": "210",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22001020000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22001030000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22002030000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22002040000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22003030000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22003040000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22004030000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22004040000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22005030000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "22005040000000",
    "label": null,
    "annexe_code": "220",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25001000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25002000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25003000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25004000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25005000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25006000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25007000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25008000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25009000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25010000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25011000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25012000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25013000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "25099000000000",
    "label": null,
    "annexe_code": "250",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "31001000000000",
    "label": null,
    "annexe_code": "310",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "31002000000000",
    "label": null,
    "annexe_code": "310",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36001000000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36001500000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36002000000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36002500000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36003000000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36003500000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36004000000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36004500000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36005000000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36005500000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36006000000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "36006500000000",
    "label": null,
    "annexe_code": "360",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48001000000000",
    "label": null,
    "annexe_code": "480",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48001010000000",
    "label": null,
    "annexe_code": "480",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48001020000000",
    "label": null,
    "annexe_code": "480",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48002000000000",
    "label": null,
    "annexe_code": "480",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48099000000000",
    "label": null,
    "annexe_code": "480",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450102010000",
    "label": null,
    "annexe_code": "480",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450102020000",
    "label": null,
    "annexe_code": "480",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48101000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48102000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48103000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48104000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48105000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48106000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48107000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48108000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109010000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109020000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109030000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109040000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109050000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109060000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109070000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109080000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48109090000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48110000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48111000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48111010000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48199000000000",
    "label": null,
    "annexe_code": "481",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201000000000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010000000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010100000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010200000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010201000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010202000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010203000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010300000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010400000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010401000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010402000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010403000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201010404000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201020000000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201020100000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201020200000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48201020300000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48202000000000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48299000000000",
    "label": null,
    "annexe_code": "482",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48111010000000",
    "label": null,
    "annexe_code": "483",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48399000000000",
    "label": null,
    "annexe_code": "483",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401000000000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010000000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010100000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010200000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010300000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010400000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010500000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010600000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010700000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010800000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401010900000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401011000000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401011100000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401011200000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401011300000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401011400000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401011500000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401020000000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401020100000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48401020200000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48402000000000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48402010000000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48402010100000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48402010200000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48402020000000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48402020100000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48402020200000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48499000000000",
    "label": null,
    "annexe_code": "484",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48199000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48299000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48501000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48501500000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48502000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48502500000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48503000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48503500000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48504000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48504500000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48505000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48505500000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48506000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48506500000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48507000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48507500000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48509000000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "48509500000000",
    "label": null,
    "annexe_code": "485",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010400000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000001",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000002",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030500000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030600000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030700000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040100000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040200000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050100000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050200000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC059900000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC060000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC990000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AM000000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP990000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010300000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020000000001",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101020000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101090000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102010200",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102010900",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000001",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000002",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000003",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030201000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030202000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030300000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030400000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030900000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040101000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040102000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040103000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040109000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040200000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040300000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050000000001",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050400000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PACP9900000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PROV0000000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "TOTALA00000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "TOTALB00000000",
    "label": null,
    "annexe_code": "510",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010400000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000001",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000002",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030500000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030600000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030700000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040100000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040200000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050100000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050200000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC059900000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC060000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AM000000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP990000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010300000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020000000001",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000001",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000002",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000003",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030201000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030202000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030300000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030400000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030900000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040102000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040103000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040109000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040200000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040300000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050000000001",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PACP9900000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PROV0000000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "TOTALA00000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "TOTALB00000000",
    "label": null,
    "annexe_code": "520",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010400000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000001",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000002",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030500000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030600000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030700000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040100000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040200000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050100000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050200000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC059900000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC060000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AM000000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP990000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010300000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020000000001",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000001",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000002",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000003",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030201000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030202000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030300000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030400000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030900000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040102000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040103000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040109000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040200000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040300000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050000000001",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PROV0000000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "TOTALA00000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "TOTALB00000000",
    "label": null,
    "annexe_code": "530",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "54099000000000",
    "label": null,
    "annexe_code": "540",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "55099000000000",
    "label": null,
    "annexe_code": "550",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "56000000000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "56000000000001",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "56000000000002",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "56000000000003",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "56000000000004",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "56001000000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "56002000000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "56003000000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "56004000000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101090000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102010900",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102020900",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030000000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030900000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040101000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040209000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040300000000",
    "label": null,
    "annexe_code": "560",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040101000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040102000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040103000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040104000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040105000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040106000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040109000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040201000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040202000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040203000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040204000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040205000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040206000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040209000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050101000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050102000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050103000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050104000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050105000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050109000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050201000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050202000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050300000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050400000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450000000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450100000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450101000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450101010000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450101020000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450101030000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450101040000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450102000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450102010000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450102020000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450103000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450200000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC459900000000",
    "label": null,
    "annexe_code": "620",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "63099000000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP040600000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030200000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030200000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030200000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030201000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030202000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030202000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030202000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209010000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209010001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209010002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209020000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209020001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209020002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030300000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030301000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030301000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030301000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030302000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030302000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030302000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030400000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030400000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030400000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030900000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030900000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030900000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040101000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040102000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040102000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040102000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040103000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040103000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040103000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040109000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040109000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040109000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040200000000",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040200000001",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040200000002",
    "label": null,
    "annexe_code": "630",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000000",
    "label": null,
    "annexe_code": "640",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000001",
    "label": null,
    "annexe_code": "640",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000002",
    "label": null,
    "annexe_code": "640",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002000000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002010000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002010100000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002010200000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002010300000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002020000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002030000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002030100000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002030200000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002030300000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002030400000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002030500000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002040000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72003000000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72003010000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72003010100000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72003010200000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72003010300000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72003010400000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72003020000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72004000000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72004010000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72004020000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72004020100000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72004020200000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72005010000000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72005010100000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72005010200000",
    "label": null,
    "annexe_code": "720",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72002000000000",
    "label": null,
    "annexe_code": "730",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "72003000000000",
    "label": null,
    "annexe_code": "730",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "73001000000000",
    "label": null,
    "annexe_code": "730",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "73002000000000",
    "label": null,
    "annexe_code": "730",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "73003000000000",
    "label": null,
    "annexe_code": "730",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "73004000000000",
    "label": null,
    "annexe_code": "730",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000000",
    "label": null,
    "annexe_code": "730",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030000000000",
    "label": null,
    "annexe_code": "730",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74001000000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74002000000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74003000000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74003010000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74003020000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74003030000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74003040000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74003050000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74004000000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74005000000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74006000000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74006010000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74006020000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74006030000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74006040000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74006050000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74006060000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74006070000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "74099000000000",
    "label": null,
    "annexe_code": "740",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "75001000000000",
    "label": null,
    "annexe_code": "750",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "75002000000000",
    "label": null,
    "annexe_code": "750",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "75003000000000",
    "label": null,
    "annexe_code": "750",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "75004000000000",
    "label": null,
    "annexe_code": "750",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "75099000000000",
    "label": null,
    "annexe_code": "750",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76001000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76002000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76003000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76004000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76005000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76006000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76007000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76008000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76009000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76010000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76011000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76012000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76013000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76014000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76015000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76016000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76017000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76018000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76019000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76020000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76021000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76022000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76023000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76024000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76025000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76026000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76027000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76028000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "76029000000000",
    "label": null,
    "annexe_code": "760",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82001000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82002000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82003000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82004000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82005000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82006000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82007000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82008010000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82008020000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82008030000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82008050000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82009010000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82009020000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82009030000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82009040000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82010010000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82010020000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82010030000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82010040000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82011010000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82011020000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82011030000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "82011040000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "83099000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "84099000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "85099000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "86099000000000",
    "label": null,
    "annexe_code": "820",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "83099000000000",
    "label": null,
    "annexe_code": "830",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "84099000000000",
    "label": null,
    "annexe_code": "840",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "85099000000000",
    "label": null,
    "annexe_code": "850",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "86099000000000",
    "label": null,
    "annexe_code": "860",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87001000000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87002000000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87002010000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87002020000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87002030000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87002040000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87002050000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87002060000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87003000000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87003010000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87003020000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "87099000000000",
    "label": null,
    "annexe_code": "870",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "88005000000000",
    "label": null,
    "annexe_code": "880",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "88006000000000",
    "label": null,
    "annexe_code": "880",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "88007000000000",
    "label": null,
    "annexe_code": "880",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC010400000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC020000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000001",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030000000002",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030500000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030600000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC030700000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040100000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC040200000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050100000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC050200000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC059900000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC060000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC070000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC450000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AC990000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "AM000000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "CP990000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA010300000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020000000001",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101020000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020101090000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102010200",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA020102010900",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000001",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000002",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030100000003",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030201000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030202000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030209000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030300000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030400000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA030900000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040101000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040102000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040103000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040109000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040200000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA040300000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050000000001",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PA050400000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PACP9900000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "PROV0000000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "TOTALA00000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  },
  {
    "code": "TOTALB00000000",
    "label": null,
    "annexe_code": "910",
    "parent_rubrique_code": null,
    "is_aggregate": null,
    "is_detail": null,
    "level": null
  }
]
$SEED_DATA$::JSONB;

  INSERT INTO referentials_rubriques (
    id, tenant_id, code, label, annexe_code,
    parent_rubrique_code, is_aggregate, is_detail, level,
    valid_from, author_user_id, status,
    created_at, updated_at
  )
  SELECT
    uuidv7(),
    v_tenant_id,
    r->>'code',
    NULL,
    r->>'annexe_code',
    NULL,
    FALSE,
    FALSE,
    NULL,
    v_valid_from,
    v_author_id,
    'draft',
    NOW(),
    NOW()
  FROM jsonb_array_elements(v_data) AS r
  ON CONFLICT (tenant_id, annexe_code, code, valid_from) DO NOTHING;
END $$;
