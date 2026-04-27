/**
 * REGFlow — RDG rules loader.
 *
 * Reads versioned rules from the `rules` table and maps each row to the
 * canonical `RuleWithTerms` contract consumed by the engine. The mapping
 * is purely structural: no operator is invented, no default tenant is
 * assumed, no threshold is hardcoded. Unknown operators fail loud at
 * load time so that the engine never sees an unsupported verdict path.
 *
 * The status filter defaults to ['active'] for production callers; the
 * golden test passes ['draft'] because the seed migrations (038-042)
 * insert rules in draft status pending the four-eyes promotion.
 */

import type { Pool } from 'pg';

import type { RuleTerm, RuleWithTerms } from './types.js';

const VALID_OPER_REGLE = ['=', '>=', '<=', '>', '<', 'SUM', 'MAX', 'MIN', 'VA'] as const;
type ValidOperRegle = (typeof VALID_OPER_REGLE)[number];

function validateOper(raw: string): ValidOperRegle {
  if ((VALID_OPER_REGLE as readonly string[]).includes(raw)) {
    return raw as ValidOperRegle;
  }
  throw new Error(`[rules-loader] unsupported operator: ${JSON.stringify(raw)}`);
}

const VALID_TERM_OP = ['+', '-', '*', '/'] as const;
type ValidTermOp = (typeof VALID_TERM_OP)[number];

function normalizeTermOp(raw: string | null): ValidTermOp | null {
  if (raw === null) return null;
  if ((VALID_TERM_OP as readonly string[]).includes(raw)) {
    return raw as ValidTermOp;
  }
  return null;
}

function normalizeRang(raw: number): number {
  if (!Number.isInteger(raw) || raw < 1) {
    throw new Error(`[rules-loader] invalid term rang: ${raw}`);
  }
  return raw;
}

interface JsonbTerm {
  rang: number;
  ax_origine: string | null;
  rubrique: string | null;
  colonne: number | string | null;
  oper_term: string | null;
  num_seq: number;
}

function mapJsonbTerm(ruleId: string, t: JsonbTerm): RuleTerm {
  return {
    id: `${ruleId}::r${t.rang}::s${t.num_seq}`,
    rang: normalizeRang(t.rang),
    numSeq: t.num_seq,
    termOp: normalizeTermOp(t.oper_term),
    kind: 'cell_ref',
    axOrigine: t.ax_origine ?? null,
    rubriqueCode: t.rubrique ?? null,
    colonne: t.colonne == null ? null : String(t.colonne),
    literalValue: null,
    literalText: null,
  };
}

interface RuleRow {
  id: string;
  ax_term: string;
  num_regle: number;
  operator: string;
  type_ctrl_computed: string;
  zone_texte: string | null;
  terms: JsonbTerm[];
  terms_count: number;
  version: number;
  valid_from: Date;
  valid_to: Date | null;
}

export interface LoadRulesOptions {
  pool: Pool;
  tenantId: string;
  arreteDate: Date;
  /**
   * Lifecycle statuses to include. Defaults to ['active']; pass ['draft']
   * to read pre-promotion seeds in tests.
   */
  statuses?: readonly string[];
}

export async function loadRules(opts: LoadRulesOptions): Promise<RuleWithTerms[]> {
  const { pool, tenantId, arreteDate, statuses = ['active'] } = opts;

  const { rows } = await pool.query<RuleRow>(
    `SELECT id, ax_term, num_regle, operator,
            type_ctrl_computed, zone_texte,
            terms, terms_count, version,
            valid_from, valid_to
       FROM rules
      WHERE tenant_id = $1
        AND valid_from <= $2
        AND (valid_to IS NULL OR valid_to > $2)
        AND deleted_at IS NULL
        AND status = ANY($3::text[])
      ORDER BY ax_term, num_regle`,
    [tenantId, arreteDate, statuses],
  );

  return rows.map((row) => {
    const terms = [...row.terms]
      .sort((a, b) => a.rang - b.rang || a.num_seq - b.num_seq)
      .map((t) => mapJsonbTerm(row.id, t));
    return {
      id: row.id,
      tenantId,
      axTerm: row.ax_term,
      numRegle: row.num_regle,
      operRegle: validateOper(row.operator),
      typeCtrl: row.type_ctrl_computed === 'inter_ax' ? 'inter_ax' : 'intra_ax',
      domaine: null,
      libAnnexe: null,
      zoneTexte: row.zone_texte ?? null,
      isFormalized: row.terms_count > 0,
      version: row.version,
      validFrom: row.valid_from.toISOString(),
      validTo: row.valid_to ? row.valid_to.toISOString() : null,
      terms,
    };
  });
}
