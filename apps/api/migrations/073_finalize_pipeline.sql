-- Migration 073_finalize_pipeline.sql
-- Object: fermeture transactionnelle du pipeline T0+T1.
--   * ALTER TABLE validation_runs ADD COLUMN error_code TEXT NULL
--     + correlation_id UUID NULL (observabilité socle, JOIN logs↔runs)
--   * CREATE TABLE run_error_codes (data-driven enum, mirror prompt_bank
--     RLS pattern: open SELECT, locked DML at GRANT layer)
--   * AMENDMENT migration 036 GRANT UPDATE: étend la liste des colonnes
--     que regflow_engine peut UPDATE pour inclure error_code +
--     correlation_id (sans ce GRANT, la route /finalize reçoit
--     SQLSTATE 42501 insufficient_privilege côté regflow_engine)
--   * Seed run_error_codes verbatim depuis apps/api/seeds/run_error_codes.json
--   * Seed platform_config: t1_finalize_retry_max + t1_finalize_retry_backoff_seconds
--     (Tranche 0 — chatbot-py retry exponential lit ces clés, jamais hardcodé)
-- Author: ALGORIA Factory
-- Date: 2026-05-04
-- Depends on: 025_validation_runs.sql (table cible),
--             036_grants_regflow_app.sql (GRANT list à étendre),
--             051_platform_config.sql (table de tunables runtime).
-- References: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3 (no magic
--             literals in TS/Python source — tunables in platform_config),
--             docs/06 §11 (validation_runs schema), §22.3 (RLS),
--             plan Tranche 0 « ouvrir-polished-pixel » §Vague A1.
--
-- Idempotent: ALTER COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- ON CONFLICT (code) DO UPDATE for the seed (label/severity may evolve
-- between deploys without losing FK referential integrity from
-- validation_runs.error_code).
--
-- No session vars required: this migration is system-global (the
-- run_error_codes catalogue is process-wide, not per-tenant).

-- ─────────────────────────────────────────────────────────────────────────────
-- 073-A — colonnes validation_runs.error_code + correlation_id
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE validation_runs
  ADD COLUMN IF NOT EXISTS error_code TEXT NULL;

ALTER TABLE validation_runs
  ADD COLUMN IF NOT EXISTS correlation_id UUID NULL;

-- Partial index on correlation_id: every observability JOIN filters on
-- (correlation_id IS NOT NULL); the partial WHERE keeps the index small
-- on historical rows that pre-date the column.
CREATE INDEX IF NOT EXISTS validation_runs_idx_correlation_id
  ON validation_runs (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 073-B — table run_error_codes (catalogue data-driven)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS run_error_codes (
  code         TEXT PRIMARY KEY,
  label_fr     TEXT NOT NULL,
  label_en     TEXT NOT NULL,
  label_ar     TEXT NOT NULL,
  severity     TEXT NOT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,

  CONSTRAINT run_error_codes_ck_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT run_error_codes_ck_severity
    CHECK (severity IN ('error', 'warning'))
);

-- Open SELECT: any role with USAGE on the schema can read the catalogue
-- (matches platform_config doctrine — read is process-wide, write is
-- locked at the GRANT layer below).
ALTER TABLE run_error_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_error_codes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS run_error_codes_select ON run_error_codes;
CREATE POLICY run_error_codes_select ON run_error_codes
  FOR SELECT
  USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON run_error_codes FROM regflow_app;
REVOKE INSERT, UPDATE, DELETE ON run_error_codes FROM regflow_engine;

-- ─────────────────────────────────────────────────────────────────────────────
-- 073-C — foreign key validation_runs.error_code → run_error_codes(code)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Wrapped in DO block so re-applying the migration after the FK exists
-- does not raise duplicate_object (42710). pg_constraint catalogue is
-- the source of truth for existence.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'validation_runs'
       AND c.conname = 'validation_runs_fk_error_code'
  ) THEN
    ALTER TABLE validation_runs
      ADD CONSTRAINT validation_runs_fk_error_code
      FOREIGN KEY (error_code)
      REFERENCES run_error_codes (code)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 073-D — AMENDMENT migration 036 : étendre GRANT UPDATE regflow_engine
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sans cet ajout, la route POST /api/engine/runs/:runId/finalize tournée
-- sous le rôle regflow_engine recevrait :
--   ERROR: permission denied for table validation_runs (SQLSTATE 42501)
-- au moment du UPDATE. La GRANT UPDATE par colonne est cumulative —
-- ajouter (error_code, correlation_id) ne révoque rien.

GRANT UPDATE (error_code, correlation_id)
  ON validation_runs
  TO regflow_engine;

-- ─────────────────────────────────────────────────────────────────────────────
-- 073-E — seed run_error_codes (embedded JSON, mirror seed pattern 057)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Source verbatim: apps/api/seeds/run_error_codes.json. Si le JSON
-- évolue, ce bloc DOIT être resynchronisé via une nouvelle migration
-- (le DBA peut differ le bloc avec le fichier source pour vérifier).

DO $$
DECLARE
  v_data     JSONB;
  v_upserted INTEGER;
BEGIN

  v_data := $SEED_DATA$
[
  {
    "code": "t0_xsd_invalid",
    "label_fr": "Structure XSD invalide. Le fichier XML ne respecte pas le schéma BCT.",
    "label_en": "Invalid XSD structure. The XML file does not conform to the BCT schema.",
    "label_ar": "بنية XSD غير صالحة. لا يتوافق ملف XML مع مخطط البنك المركزي التونسي.",
    "severity": "error"
  },
  {
    "code": "t0_embedded_fail",
    "label_fr": "Contrôles embarqués BCT échoués (annexes compagnes manquantes ou totaux incohérents).",
    "label_en": "BCT embedded controls failed (missing companion annexes or inconsistent totals).",
    "label_ar": "فشل الضوابط المضمنة للبنك المركزي التونسي (ملاحق مرافقة مفقودة أو إجماليات متناقضة).",
    "severity": "error"
  },
  {
    "code": "t0_parse_error",
    "label_fr": "Erreur de parsing XML. Le fichier ne peut pas être lu (encodage, syntaxe, ou contenu corrompu).",
    "label_en": "XML parsing error. The file cannot be read (encoding, syntax, or corrupted content).",
    "label_ar": "خطأ في تحليل XML. لا يمكن قراءة الملف (الترميز أو بناء الجملة أو محتوى تالف).",
    "severity": "error"
  },
  {
    "code": "t1_engine_exception",
    "label_fr": "Exception du moteur RDG pendant l'évaluation. Veuillez contacter votre administrateur.",
    "label_en": "RDG engine exception during evaluation. Please contact your administrator.",
    "label_ar": "استثناء محرك RDG أثناء التقييم. يرجى الاتصال بمسؤولك.",
    "severity": "error"
  },
  {
    "code": "t1_no_verdicts",
    "label_fr": "Le moteur RDG n'a produit aucun verdict pour ce run (corpus de règles vide ou applicable_total nul).",
    "label_en": "RDG engine produced no verdicts for this run (empty rule set or applicable_total is zero).",
    "label_ar": "لم ينتج محرك RDG أي حكم لهذا التشغيل (مجموعة القواعد فارغة أو applicable_total هو صفر).",
    "severity": "error"
  },
  {
    "code": "t1_timeout",
    "label_fr": "Le moteur RDG n'a pas répondu dans le délai imparti. Veuillez réessayer.",
    "label_en": "The RDG engine did not respond within the allotted time. Please retry.",
    "label_ar": "لم يستجب محرك RDG في الوقت المحدد. يرجى إعادة المحاولة.",
    "severity": "error"
  }
]
$SEED_DATA$::JSONB;

  INSERT INTO run_error_codes (code, label_fr, label_en, label_ar, severity)
  SELECT
    p->>'code',
    p->>'label_fr',
    p->>'label_en',
    p->>'label_ar',
    p->>'severity'
  FROM jsonb_array_elements(v_data) p
  ON CONFLICT (code) DO UPDATE
    SET label_fr   = EXCLUDED.label_fr,
        label_en   = EXCLUDED.label_en,
        label_ar   = EXCLUDED.label_ar,
        severity   = EXCLUDED.severity,
        deleted_at = NULL,
        updated_at = NOW();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;
  RAISE NOTICE 'migration 073-E: run_error_codes upserted (% rows)', v_upserted;

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 073-F — seed platform_config: retry exponentiel chatbot-py finalize
-- ─────────────────────────────────────────────────────────────────────────────
--
-- chatbot-py RegflowApiClient.finalize_run() lit ces deux clés au
-- runtime via getPlatformConfigNumber()/getPlatformConfigArray(). Aucun
-- backoff codé en dur côté Python (Guard D-006).
--
-- Defaults (3 tentatives, [1s, 2s, 4s]) sont conservateurs : couvrent
-- les hoquets réseau usuels sans bloquer la réponse à l'opérateur plus
-- de ~7s cumulés.

INSERT INTO platform_config (config_key, config_value, description)
VALUES (
  't1_finalize_retry_max',
  '3'::jsonb,
  'Nombre maximal de tentatives POST /finalize côté chatbot-py sur ' ||
  'erreur réseau (httpx.HTTPError ou 5xx). Lu par RegflowApiClient.' ||
  'finalize_run(). Au-delà, l''exception remonte au caller. Doctrine ' ||
  'idempotente : chaque retry réutilise le même correlation_id pour ' ||
  'que /finalize reconnaisse la duplication via le diff canonique.'
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO platform_config (config_key, config_value, description)
VALUES (
  't1_finalize_retry_backoff_seconds',
  '[1, 2, 4]'::jsonb,
  'Tableau de durées (secondes) de backoff entre les tentatives ' ||
  'POST /finalize. La N-ième tentative attend backoff[N-1] secondes ' ||
  'avant de partir. Longueur = t1_finalize_retry_max - 1 (la 1ère ' ||
  'tentative ne backoff pas). Lu par chatbot-py au démarrage et ' ||
  'caché process-life via platformConfig loader.'
)
ON CONFLICT (config_key) DO NOTHING;
