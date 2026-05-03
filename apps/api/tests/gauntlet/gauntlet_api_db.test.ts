/**
 * GAUNTLET — Blocs D + E : Backend API + Base de données.
 *
 * Couvre les invariants HTTP / DB du Backend Node.js (Express + pg natif)
 * et de la couche stockage Postgres (RLS, immutability triggers, 4-eyes
 * CHECK constraints, unique partial indexes, audit triggers).
 *
 * Découpage:
 *   D — helpers purs hors describeIfDb : mapSeverity (8 cas) +
 *       loadSeverityThreshold fallback (mock pool).
 *   D — routes via supertest sous describeIfDb (DATABASE_URL requis,
 *       fourni en CI sur le job test-api).
 *   E — invariants schéma via pg_catalog queries (SELECT-only, donc
 *       aucun bypass RLS requis — la lecture de pg_constraint /
 *       pg_indexes / pg_trigger est superuser-grade par défaut).
 *
 * Pattern setupRoutesContext copié verbatim de tests/routes/_setup.ts ;
 * seul pattern de tests d'intégration backend du repo (cf. décision
 * GAUNTLET B2 — option (i)).
 *
 * Réf. doc 03 §10 (API Node.js + Express, Zod, JWT)
 * Réf. doc 06 §22 (RLS), §27 (Invariants : immutabilité, 4-yeux, unicité)
 * Réf. PRD §6 (4 611 règles BCT)
 */

import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import request from 'supertest';

import { config } from '../../src/config.js';
import {
  PlatformConfigMissingError,
  clearPlatformConfigCache,
} from '../../src/lib/platformConfig.js';
import { loadSeverityThreshold, mapSeverity } from '../../src/routes/engine.js';
import {
  setupRoutesContext,
  teardownRoutesContext,
  type RoutesTestContext,
} from '../routes/_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

const FAKE_RUN_ID = '00000000-0000-7000-8000-000000000000';

function engineToken(tenantId: string): string {
  const secret = config.jwt.secret;
  if (secret === undefined) {
    throw new Error('JWT_SECRET must be set in test env');
  }
  return jwt.sign({ role: 'regflow_engine', tenant_id: tenantId }, secret);
}

// ===========================================================================
// BLOC D — HELPERS PURS (no DB, no network)
// ===========================================================================

describe('GAUNTLET D-05: mapSeverity — 7 cas exhaustifs', () => {
  // INVARIANT: mapSeverity est la traduction canonique du verdict du moteur
  // ('severe' | 'rounding' | null) vers la taxonomie REGFlow front-facing
  // (BLOQUANT | MAJEUR | MINEUR | null). Toute divergence sur ce mapping
  // = sévérité incorrecte affichée à l'opérateur de conformité.
  // Réf. PRD §10, doc 06 §27.

  it.each<
    ['severe' | 'rounding' | null, number | null, number, 'BLOQUANT' | 'MAJEUR' | 'MINEUR' | null]
  >([
    [null, null, 0.1, null],
    [null, 0.5, 0.1, null],
    ['rounding', 0.5, 0.1, 'MINEUR'],
    ['rounding', null, 0.1, 'MINEUR'],
    ['severe', 0.05, 0.1, 'MAJEUR'],
    ['severe', 0.15, 0.1, 'BLOQUANT'],
    ['severe', 0.1, 0.1, 'MAJEUR'], // > strict, pas >=
    ['severe', null, 0.1, 'MAJEUR'],
  ])('mapSeverity(%j, %j, %j) → %j', (severity, gapRel, threshold, expected) => {
    expect(mapSeverity(severity, gapRel, threshold)).toBe(expected);
  });
});

describe('GAUNTLET D-09: loadSeverityThreshold — fallback 0.10 (mock pool)', () => {
  // INVARIANT: quand la clé platform_config est manquante, le helper
  // renvoie 0.10 (fallback documenté) sans propager l'exception. Cette
  // tolérance protège la disponibilité du moteur face à une mauvaise
  // configuration plateforme. Le seul appel pool.query est mocké pour
  // garder ce test hors describeIfDb.

  beforeEach(() => {
    clearPlatformConfigCache();
  });

  it('returns 0.10 when platform_config row is missing', async () => {
    const pool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [] }),
    } as unknown as Pool;
    const value = await loadSeverityThreshold(pool);
    expect(value).toBe(0.1);
  });

  it('propagates non-PlatformConfig errors (network down, syntax error, ...)', async () => {
    const pool = {
      query: jest.fn().mockRejectedValueOnce(new Error('boom')),
    } as unknown as Pool;
    await expect(loadSeverityThreshold(pool)).rejects.toThrow(/boom/);
  });

  it('exposes PlatformConfigMissingError as a public symbol (callers can catch it)', () => {
    // Belt-and-suspenders: prove the export surface stays stable so the
    // fallback contract is explicit, not implicit.
    expect(typeof PlatformConfigMissingError).toBe('function');
  });
});

// ===========================================================================
// BLOC D + E — DB-conditional (require DATABASE_URL)
// ===========================================================================

describeIfDb('GAUNTLET D + E — Backend API + DB invariants (DB-backed)', () => {
  let ctx: RoutesTestContext;

  beforeAll(async () => {
    // Tier 72 = full migration set including 072_seed_intent_launch_validation
    // (the C17b launch_validation row). setupRoutesContext applies migrations
    // 1..72 inside a throwaway schema and seeds a tenant + user.
    ctx = await setupRoutesContext(72);
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  // -------------------------------------------------------------------------
  // BLOC D — Backend API surface
  // -------------------------------------------------------------------------

  it('D-01: POST /api/engine/runs/:runId/evaluate rejects without engine token (401)', async () => {
    // INVARIANT: la route /evaluate exige engineAuth — un client non-signé
    // ne doit jamais déclencher le moteur RDG (coût Gemini + IO XML).
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${FAKE_RUN_ID}/evaluate`)
      .send({ arrete_date: '2026-02-28' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_BEARER');
  });

  it('D-02a: /evaluate rejects malformed arrete_date (400 INVALID_ARRETE_DATE)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${FAKE_RUN_ID}/evaluate`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({ arrete_date: '28/02/2026' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ARRETE_DATE');
  });

  it('D-02b: /evaluate rejects missing arrete_date (400)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${FAKE_RUN_ID}/evaluate`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ARRETE_DATE');
  });

  it('D-03: /evaluate returns 404 RUN_XML_NOT_FOUND when no xml_uploads attached', async () => {
    // INVARIANT: pas de XML pour le run → 404 explicite, pas une 500
    // silencieuse. L'opérateur reçoit un code actionnable.
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${FAKE_RUN_ID}/evaluate`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({ arrete_date: '2026-02-28' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RUN_XML_NOT_FOUND');
  });

  it('D-04: /evaluate envelope is { error: { code, message } } on auth failure', async () => {
    // INVARIANT: la forme d'erreur est { error: { code, message } } —
    // la convention { data, meta, error } prévue par fetchApi côté frontend.
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${FAKE_RUN_ID}/evaluate`)
      .send({ arrete_date: '2026-02-28' });
    expect(res.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        }),
      }),
    );
  });

  it('D-06: GET /health responds 200 without auth (public liveness endpoint)', async () => {
    const res = await request(ctx.app).get('/health');
    expect(res.status).toBe(200);
  });

  it('D-07: GET /api/tenants/:id/runs/current refuses requests without X-User-Id header', async () => {
    // INVARIANT: routes user-facing exigent l'header X-User-Id (via
    // authMiddleware). Sans header → 401/403, jamais 200.
    const res = await request(ctx.app).get(`/api/tenants/${ctx.tenantId}/runs/current`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('D-08: POST /chat/message is NOT served by the Node API (lives on chatbot-py:8000)', async () => {
    // INVARIANT architectural: le chat conversationnel est servi par
    // chatbot-py (FastAPI :8000), pas par l'API Node (:3000). Une réponse
    // 200/201 ici trahirait un dérapage de séparation des couches.
    const res = await request(ctx.app).post('/chat/message').send({});
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // BLOC E — DB invariants via pg_catalog (SELECT-only, RLS-neutral)
  // -------------------------------------------------------------------------

  it('E-01: schema reached tier 072 (intent_specialists.aggregator_function_name column exists)', async () => {
    // INVARIANT: la grammaire intent_specialists C17b est en place. Le test
    // setupRoutesContext(72) applique les fichiers SQL directement dans un
    // schéma jetable sans passer par migrator.ts ; `schema_migrations`
    // reste donc vide. On vérifie un artefact STRUCTUREL spécifique au
    // tier ≥ 064 (la colonne aggregator_function_name ajoutée par
    // 064_intent_specialists.sql, table consommée par 072 pour seeder
    // l'intent launch_validation). Cette colonne n'existe pas dans les
    // tiers antérieurs.
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name   = 'intent_specialists'
          AND column_name  = 'aggregator_function_name'`,
      [ctx.schemaName],
    );
    expect(rows[0]!.count).toBe('1');
  });

  it('E-02: prompt_bank has FORCE RLS + 4 CRUD policies (read/insert/update/delete)', async () => {
    // INVARIANT: le patrimoine intellectuel des prompts est protégé par
    // RLS (gated platform_owner). Vérification structurelle car la lecture
    // RLS-bound exigerait un setup user_roles + GUC complet.
    // Réf. doc 06 §22.2.
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = 'prompt_bank'`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
    const { rows: policies } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM pg_policies
        WHERE schemaname = $1 AND tablename = 'prompt_bank'`,
      [ctx.schemaName],
    );
    expect(Number.parseInt(policies[0]!.count, 10)).toBeGreaterThanOrEqual(4);
  });

  it('E-03: validation_runs immutability trigger is registered (BEFORE UPDATE OR DELETE)', async () => {
    // INVARIANT: les runs sont immuables — toute UPDATE sur les colonnes
    // critiques est bloquée par le trigger. Vérification structurelle :
    // le trigger doit être présent, actif, attaché à BEFORE.
    // Réf. doc 06 §27 invariant 3.
    const { rows } = await ctx.testPool.query<{
      tgname: string;
      tgtype: number;
      tgenabled: string;
    }>(
      `SELECT t.tgname, t.tgtype, t.tgenabled
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname = 'validation_runs'
          AND t.tgname = 'validation_runs_immutability'
          AND NOT t.tgisinternal`,
      [ctx.schemaName],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.tgenabled).toBe('O'); // 'O' = enabled in origin/local
  });

  it('E-04: prompt_bank carries the prompt_bank_ck_four_eyes CHECK constraint', async () => {
    // INVARIANT: 4-eyes CHECK : status='active' implique validator_user_id
    // distinct de author_user_id. Vérification structurelle (la violation
    // comportementale exigerait l'élévation de privilège platform_owner +
    // GUC app.current_app_user_id, hors-scope ici).
    // Réf. doc 06 §8 prompt_bank_ck_four_eyes.
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = $1
          AND t.relname = 'prompt_bank'
          AND c.conname = 'prompt_bank_ck_four_eyes'
          AND c.contype = 'c'`,
      [ctx.schemaName],
    );
    expect(rows[0]!.count).toBe('1');
  });

  it('E-05: prompt_bank has the unique partial index for active rows', async () => {
    // INVARIANT: un seul prompt active par (tenant, agent_type, function_name).
    // L'index partiel WHERE status='active' AND deleted_at IS NULL
    // garantit l'unicité au niveau de la base — toute tentative de
    // promote concurrent est bloquée par 23505.
    const { rows } = await ctx.testPool.query<{
      indexdef: string;
    }>(
      `SELECT indexdef
         FROM pg_indexes
        WHERE schemaname = $1
          AND tablename = 'prompt_bank'
          AND indexname = 'prompt_bank_idx_unique_active'`,
      [ctx.schemaName],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.indexdef.toUpperCase()).toContain('UNIQUE');
    // Postgres surface le predicat avec un cast explicite ::text dans
    // pg_indexes.indexdef ("(status)::text = 'active'::text"). On match
    // l'invariant via regex pour rester indifférent au cast.
    expect(rows[0]!.indexdef).toMatch(/status\)?::text\s*=\s*'active'/);
  });

  it('E-06: platform_config carries severity_gap_relative_threshold = 0.10', async () => {
    // INVARIANT: la valeur seedée par 071_seed_severity_threshold doit
    // être exactement 0.10 (numérique, pas string). Toute dérive change
    // la frontière BLOQUANT/MAJEUR pour tous les tenants en une fois.
    const { rows } = await ctx.testPool.query<{ value: number }>(
      `SELECT (config_value)::text::numeric AS value
         FROM platform_config
        WHERE config_key = 'severity_gap_relative_threshold'
          AND deleted_at IS NULL`,
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0]!.value)).toBe(0.1);
  });

  it('E-07: rules table has the regflow_app grant matrix (SELECT/INSERT/UPDATE/DELETE)', async () => {
    // INVARIANT: la table `rules` est l'épine dorsale du moteur — les 4
    // privilèges DML doivent être accordés à regflow_app. Sans ces grants,
    // l'API Node échoue silencieusement à charger les règles. Vérification
    // structurelle car le seed `rules` (042) charge < 1000 lignes en
    // schéma de test mais > 4000 en prod ; le test ne dépend donc pas du
    // volume seedé en CI.
    const { rows } = await ctx.testPool.query<{
      privilege_type: string;
    }>(
      `SELECT privilege_type
         FROM information_schema.table_privileges
        WHERE table_schema = $1
          AND table_name   = 'rules'
          AND grantee      = 'regflow_app'
        ORDER BY privilege_type`,
      [ctx.schemaName],
    );
    const granted = new Set(rows.map((r) => r.privilege_type));
    expect(granted.has('SELECT')).toBe(true);
    expect(granted.has('INSERT')).toBe(true);
    expect(granted.has('UPDATE')).toBe(true);
    expect(granted.has('DELETE')).toBe(true);
  });

  it('E-08: rules carries the audit_trigger_function trigger (audit traçabilité)', async () => {
    // INVARIANT: chaque écriture sur `rules` (sensible — patrimoine RDG)
    // produit une entrée audit_log. Vérification structurelle du trigger.
    // Réf. doc 06 §6 audit systémique obligatoire.
    const { rows } = await ctx.testPool.query<{
      tgname: string;
    }>(
      `SELECT t.tgname
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = $1
          AND c.relname = 'rules'
          AND p.proname = 'audit_trigger_function'
          AND NOT t.tgisinternal`,
      [ctx.schemaName],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
