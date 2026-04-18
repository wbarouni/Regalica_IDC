# Extracted Facts from Master Document v1.1

> Source: `docs/architecture/00-master-document.md` (v1.1, April 2026, ~2089 lines).
> Every claim is cited with section number (§X.Y). Where data was absent, labeled **NOT SPECIFIED**.

---

## 1. The 7 Inviolable Pillars (§3)

Non-negotiable architectural principles. Must be displayed in compliance room, printed in Runbook first page, and verifiable automatically in CI (§3 preamble).

### Pilier 1 — ZERO TOLERANCE (§3.1)
- **Definition:** Tout écart non nul = SEVERE. Aucune tolérance d'arrondi.
- **Rationale:** Maximalist regulatory position, defendable in BCT audit. No grey zone.
- **Implementation constraints:**
  - Field `tolerance` REMOVED from `rules` schema.
  - Strict `==` equality test in evaluator — no epsilon (§9.4).
  - `InvestigatorAgent` transforms this rigor into acceptable UX.

### Pilier 2 — ZERO HARDCODING (§3.2)
- **Definition:** Aucune règle BCT, aucune rubrique, aucun prompt LLM en dur dans le code.
- **Rationale:** Regulatory evolution = data update, not code change. Enables no-code creation.
- **Implementation constraints:**
  - Tables: `rules`, `bct_rubriques`, `prompts_registry`, `annexe_columns`.
  - Custom linter validates each PR (CI check).
  - Existing `/public/rdg_rules.json` must be migrated to DB table `rules` (§19.1).

### Pilier 3 — ZERO HALLUCINATION (§3.3)
- **Definition:** Le LLM ne fait jamais de calcul. Chaque réponse IA contient une citation vérifiable.
- **Rationale:** In banking context, an invented number = potential regulatory sanction.
- **Implementation constraints:**
  - Decimal.js 28 digits minimum mandatory (v1.1 uses 38 digits safety margin — §changelog).
  - Guardrails reject any non-sourced response (§10.2).
  - Red team testing in CI.

### Pilier 4 — SUGGEST DON'T REPAIR (§3.4)
- **Definition:** L'IA suggère précisément les corrections. L'humain corrige son XML. Tout est versionné.
- **Rationale:** Clear juridical responsibility (human) with AI intelligence benefit.
- **Implementation constraints:**
  - Table `upload_versions` required.
  - `StructureValidatorAgent` generates `RepairSuggestion[]`.
  - User re-uploads — platform never mutates XML.

### Pilier 5 — SILENT GUARDIAN (§3.5)
- **Definition:** Tests techniques invisibles après signature 4-yeux. Alerte non-bloquante si anomalie.
- **Rationale:** Speed + safety net. 99% frictionless, 1% critical protected.
- **Implementation constraints:**
  - `SilentGuardianAgent` tests on last validated-conforming report.
  - Non-blocking modal alert on anomaly.
  - Runs AFTER 4-eyes signature.

### Pilier 6 — IMMUTABLE HISTORY (§3.6)
- **Definition:** Rapports validés figés aux règles de leur époque. Reproductibilité bit-identique pendant 10 ans.
- **Rationale:** BCT audit obligation. Auditor in 2036 must verify 2026 report.
- **Implementation constraints:**
  - Tables versioned: `rules_history`, `kb_snapshots`, `prompts_registry`.
  - Replay engine required (cf. §13.4 Journey 4).
  - `rules.version` never overwritten (§16.3).

### Pilier 7 — HIERARCHICAL TENANCY (§3.7)
- **Definition:** Maison-mère + filiales avec héritage règles. Résolution récursive.
- **Rationale:** Banking group reality (QNB Tunisia + Leasing + Factoring).
- **Implementation constraints:**
  - Table `entities` with `parent_entity_id`.
  - Local overrides possible per entity.
  - RLS 100% enforced (§10.1).

---

## 2. The 16 CEO Decisions (§4)

All decisions are "gravées dans la pierre" — can only be modified via an ADR (§4 preamble).

### Regulatory Tolerance (§4 — 3 decisions)

| # | Decision | Architectural Impact |
|---|---|---|
| **D1.1** | **Montants :** SEVERE strict sur tous écarts. User régénère XML. | No `tolerance` column in DB. Non-zero gap → FAIL. User re-uploads corrected XML. |
| **D1.2** | **Ratios :** Zéro tolérance absolue. Calcul Decimal.js 28 digits. | Decimal.js 28+ digits library mandated (38 in v1.1). |
| **D1.3** | **Inter-annexes :** Zéro tolérance absolue. Investigation auto si écart. | InvestigatorAgent auto-triggered on any inter-annexe FAIL. |

### Validation Workflow (§4 — 5 decisions)

| # | Decision | Architectural Impact |
|---|---|---|
| **D2.1** | **Granularité :** Dual (annexe unitaire OR reporting consolidé). | UI must support both single-XML upload and batch consolidation. |
| **D2.2** | **Check structure :** Full check 7 dimensions (balises, types, encoding, namespace, XSD, dates, cohérence). | StructureValidatorAgent runs 7 dimensions — BLOCKING (§9.1). |
| **D2.3** | **Structure KO :** Suggestions précises + re-upload + versionning obligatoire. | `upload_versions` table; precise repair suggestions. |
| **D2.4** | **Rapport lié :** Dernière version validée conforme (safe reference). | Inter-annexe lookup resolves to last-conformant version. |
| **D2.5** | **Clef rattachement :** Composite (reporting + référence + tenant + entité). | Composite natural key on report attachment (Phase 2 §20). |

### No-Code Rule Addition (§4 — 5 decisions)

| # | Decision | Architectural Impact |
|---|---|---|
| **D3.1** | **Source découverte :** Hybride XSD + inférence guidée. | SchemaInferencerAgent bootstraps XSD from examples. |
| **D3.2** | **Ergonomie :** Tri-mode Copilot + Expert + Learning par lot. | 3 distinct UI flows for rule creation (§12.4). |
| **D3.3** | **Validation règle :** Signature 4-yeux + Silent Guardian tests invisibles. | 4-eyes co-signing required; SilentGuardianAgent verifies post-hoc. |
| **D3.4** | **Périmètre rubriques :** XSD + data dictionary + règles existantes (auto-complete cross). | Cross-reference autocompletion in rule builder. |
| **D3.5** | **Puissance DSL :** Expert complet (IF/THEN + ensembles + pondérations + buckets). | AST DSL supports IF/THEN, sets, weighting, buckets (Phase 2 §20). |

### Edge Cases (§4 — 5 decisions)

| # | Decision | Architectural Impact |
|---|---|---|
| **D4.1** | **Conflits règles :** Permettre avec warning visible dans rapport. | Conflict detection + Section 6bis in report (§17.2). |
| **D4.2** | **Multi-entités :** Tenant hiérarchique maison-mère + filiales avec héritage. | `entities` table + recursive resolution (Pillar 7). |
| **D4.3** | **Priorité roadmap :** Copilot d'abord (MVP) → Learning → Expert. | Copilot = Phase 4; Learning = Phase 5; Expert = Phase 6 (§20). |
| **D4.4** | **Rapports modifiés :** Historique immuable (règles de l'époque). | `rules_history`, replay engine (Pillar 6). |
| **D4.5** | **Limitation DSL :** Aucune (toutes opérations gratuites). | No artificial DSL throttle; all ops permitted. |

---

## 3. Data Model / DB Schema (§8)

### 3.1 Core Tables (explicitly described in §8.3)

#### `rules` (1 row per rule — §8.3)
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | default `gen_random_uuid()` |
| `tenant_id` | UUID NOT NULL | FK → tenants(id). RLS on this |
| `annexe_code` | TEXT NOT NULL | e.g. '00', '51', '630' |
| `num_regle` | INT NOT NULL | local to annexe (repeats across annexes) |
| `oper_regle` | TEXT NOT NULL | CHECK IN ('=','>=','<=','>','<','SUM','MAX','MIN','VA') |
| `type_ctrl` | TEXT NOT NULL | CHECK IN ('intra_ax','inter_ax') |
| `domaine` | TEXT NOT NULL | e.g. '1- REPORTING COMPTABLE' |
| `lib_annexe` | TEXT NOT NULL | human label |
| `zone_texte` | TEXT | IF/THEN condition (208 rules) |
| `is_formalized` | BOOL NOT NULL DEFAULT TRUE | FALSE if zone_texte not parsed to AST |
| `circulaire_id` | UUID | FK → circulaires(id) |
| `version` | INT NOT NULL DEFAULT 1 | |
| `is_active` | BOOL NOT NULL DEFAULT TRUE | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `validated_by` | UUID | FK → users_profile(id) |
| `validated_at` | TIMESTAMPTZ | |
| **UNIQUE** | (tenant_id, annexe_code, num_regle, version) | |
- Index: `idx_rules_annexe_num ON rules(tenant_id, annexe_code, num_regle) WHERE is_active = TRUE`.

#### `rule_terms` (equation members — §8.3)
1 rule = N terms (avg 4, max observed 31 — §8.4).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `rule_id` | UUID NOT NULL | FK → rules(id) ON DELETE CASCADE |
| `rang` | SMALLINT NOT NULL | CHECK IN (1,2,3). 1=LHS, 2=RHS, 3=rare |
| `num_seq` | SMALLINT NOT NULL | ordering within rang |
| `term_op` | TEXT NOT NULL | CHECK IN ('+','-','*','/') |
| `kind` | TEXT NOT NULL | CHECK IN ('cell_ref','literal','literal_text') |
| `ax_origine` | TEXT | annexe source when kind='cell_ref' |
| `rubrique_code` | TEXT | required when kind='cell_ref' |
| `colonne` | TEXT | required when kind='cell_ref' |
| `literal_value` | NUMERIC(28,8) | required when kind='literal' |
| `literal_text` | TEXT | required when kind='literal_text' |
- Indexes: `idx_rule_terms_rule (rule_id, rang, num_seq)`, `idx_rule_terms_ax_origine (ax_origine, rubrique_code) WHERE kind='cell_ref'`.

#### `rules_history` (immutability — §8.3 / Pillar 6)
- `LIKE rules INCLUDING ALL` — copy of columns.
- `history_id` UUID PK.
- `valid_from` TIMESTAMPTZ NOT NULL.
- `valid_to` TIMESTAMPTZ.
- `replaced_by` UUID FK → rules(id).

### 3.2 Other Tables Referenced (not fully schema'd in doc)
The following tables are referenced but their column schemas are **NOT SPECIFIED in detail**:
- `tenants` (§3.7, §8.3 — FK target)
- `entities` — with `parent_entity_id` for hierarchy (§3.7, §12.6)
- `bct_rubriques` — catalog of rubrics (§3.2, §19.1)
- `annexe_columns` — per-annexe column definitions (§3.2)
- `prompts_registry` — versioned LLM prompts (§3.2, Pillar 6)
- `kb_snapshots` — KB versioned (Pillar 6)
- `kb_chunks` — RAG chunks with citations (§10.2 guardrail check)
- `circulaires` (§8.3 FK target)
- `users_profile` (§8.3 FK target)
- `upload_versions` — versioned uploads (Pillar 4)
- `auditlog` (existing, §19.1)

### 3.3 RLS & Multi-Tenancy (§10.1, §6.2 Couche 5, §19.1)
- **RLS 100% tables** (§6.2, Couche 5: "Postgres 15 avec 20+ tables RLS").
- **RLS activated 100% tables before any sensitive data** (§Annexe C Check-list Security).
- Tenant isolation by default (§5.2 Supabase justification).
- Hierarchical tenancy with recursive rule resolution (Pillar 7).

### 3.4 Other Data Model Facts (§8.4 volumetry)

| Entity | Measured volume |
|---|---|
| `annexes` (active distinct in RDG) | **52** (v1.0 said ~33) |
| `rules` | **4,611** exactly |
| `rule_terms` | **18,452** exactly |
| `bct_rubriques` distinct in RDG | **1,247** (catalog may be larger via XSD) |
| Avg terms/rule | 4.00 (median 3, range 1–31) |
| Rules with 1 term (nullity constraint) | **17** |
| Rules ≥10 terms | **222** |
| Rules with `ZONE_TEXTE` (conditional, non-AST) | **208** (4.5%) |
| Rules with ≥1 literal | **543** (11.8%) |
| Rules truly cross-annexe (≥2 AX_ORIGINE) | **823** (17.8%) — note `TYPE_CTRL='inter_ax'` alone underestimates at 219 |
| Rubric prefixes | ≥15 observed: AC, PA, HB, CP, PR, CH, TO, AM, PN, D, D1-D3, EM, RA, RE, SN, RN… |

---

## 4. BCT XML Format (§8.5)

### 4.1 Structure Example (§8.5)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document>
  <Entete>
    <CodeBanque>23</CodeBanque>            <!-- bank identifier -->
    <DateAnnexe>20240331</DateAnnexe>       <!-- YYYYMMDD -->
    <CodeAnnexe>630</CodeAnnexe>            <!-- target annexe code -->
  </Entete>
  <Annexe id="630">
    <Rubrique id="PA030100000000">
      <Colonne id="1">0.000</Colonne>
      <Colonne id="2">192.532</Colonne>
      <!-- ... up to 12 columns for annexe 630 ... -->
      <Colonne id="12">352735.018</Colonne>
    </Rubrique>
    <!-- ... N rubrics ... -->
  </Annexe>
</Document>
```

### 4.2 Namespaces
- **NOT SPECIFIED** — the observed XMLs use no namespace declaration. Default encoding UTF-8, BOM tolerated (§8.5).

### 4.3 Root Element & Required Fields (§8.5 invariants)
- Root `<Document>` unique, UTF-8.
- Mandatory `<Entete>` with exactly 3 children: `CodeBanque`, `DateAnnexe`, `CodeAnnexe`.
- `DateAnnexe` in `YYYYMMDD` compact format (no dashes).
- Exactly one `<Annexe id="X">` where `X == CodeAnnexe`.
- Each `<Rubrique id="…">` carries a code (14 chars canonical, majority).
- Each `<Colonne id="n">` carries decimal value `NNN.NNN` (point decimal, 3 decimals BCT standard).
- Columns numbered sequentially from `"1"` (not `"0"`, no padding).
- **Caveat:** RDG sometimes references columns with padding (`"01"`, `"02"`) — evaluator MUST normalize.

### 4.4 Rubrique Code Anatomy (§8.2)
Canonical 14-char format (88% of references):
```
AC050100000000
╔══╦════╦════╦════════╗
║AC║05  ║01  ║00000000║  ← 2-letter category + 2-digit subcat + 2-digit sub-subcat + 8-digit padding
╚══╩════╩════╩════════╝
```
Categories: AC (Actif, 2597), PA (Passif, 4026), HB (Hors Bilan, 944), CP (Capitaux Propres, 398), PR (Produits, 218), CH (Charges, 141), TO (Totaux, 162), AM, PN, D, D1-D3.

Non-canonical variants (parser MUST handle — §8.2):
| Form | Volume | Use case |
|---|---|---|
| 14-char alpha prefix (AC, PA…) | 16,255 | Standard case |
| 14-char numeric prefix (132, 480, 482, 48, 13, 74) | ~8,895 | BCEAO stat reporting |
| Short codes 1-9 chars (D1, D2, D3, E99000000) | ~1,878 | Cross-cutting columns / placeholders |
| Numeric literals (0, 100, 75, 5) when COLONNE is null | 593 (26 distinct values) | Formula constants (%, ceilings) |
| Text literals ("1 ou 2") | 7 | **Not formalized** — parse manually or via RuleLearner |

### 4.5 Example Rubrique — annexe 630 (§8.5)
```xml
<Rubrique id="PA030100000000">
  <Colonne id="1">0.000</Colonne>
  <Colonne id="2">192.532</Colonne>
  <Colonne id="12">352735.018</Colonne>
</Rubrique>
```

### 4.6 Observed XML Volumetry (§8.5)
| XML | Size | Rubrics | Columns/rubric | Usage |
|---|---|---|---|---|
| 00 (Bilan) | 63 KB | 171 | 8 | Situation Mensuelle Comptable |
| 51 (État Résultat) | 22 KB | 265 | 1 | Compte de résultat |
| 630 (Ressources) | 22 KB | 42 | 12 | Ventilation secteur institutionnel |
| 640 (Créances) | 1.7 KB | 3 | 11 | Ventilation créances clientèle |

### 4.7 Non-Trivial Semantic Points (§8.6)
1. **`AX_ORIGINE` is always literal** — when a rule stamped on annexe 630 has a term with `AX_ORIGINE='00'`, it means *literally* "look in balance sheet annexe 00" (not "look in same annexe as rule").
2. **Codes `"0"` and `"00"` are equivalent** for annexe 00; same for `"1"`/`"01"`. Ingestor MUST normalize.
3. **`TYPE_CTRL` is indicative, not authoritative.** 3,861 rows tagged `intra_ax` have `AX_TERM ≠ AX_ORIGINE`, and 236 rows `inter_ax` have both identical. Truth is in `AX_ORIGINE`: if ≥2 distinct annexes in rule, it IS cross-annexe.
4. **Rule with only rang 2 (no rang 1) = nullity constraint.** Rare (17 cases): satisfied iff Σ(rang 2 terms) = 0.

---

## 5. RDG Rules Model (§8.3, §15.5)

### 5.1 Rule Structure (fields per rule)
See §3 above for full `rules` table. Key operational fields:
- `annexe_code`, `num_regle` (composite natural key — `num_regle` is NOT globally unique; 962 distinct values for 4,611 rules — §8.3 migration attention).
- `oper_regle` ∈ {`=`, `>=`, `<=`, `>`, `<`, `SUM`, `MAX`, `MIN`, `VA`}.
- `type_ctrl` ∈ {`intra_ax`, `inter_ax`}.
- `domaine` — BCT business domain (e.g. "SD 1- RISQUE DE CRÉDIT").
- `zone_texte` — free-text IF/THEN condition (208 rules) — if present → `is_formalized=FALSE` → SKIP evaluator, queue for RuleLearner.
- No `tolerance` field (removed — Pillar 1).
- `severity` — NOT in doc schema; severity is DERIVED from verdict (§15.4).

### 5.2 Applicability Condition
- `zone_texte` (TEXT, nullable) carries conditional applicability (§15.5 Exemple 3).
- When present, rule is non-formalized and routed to RuleLearner for human formalization.

### 5.3 Evaluation DSL (AST Grammar)
The doc describes terms as records, not a free-form grammar. Effective AST = **list of `rule_terms` grouped by `rang`, aggregated per `term_op`**.

**Per-term structure:**
```
term := (rang ∈ {1,2,3}, num_seq, term_op ∈ {+,-,*,/}, kind, <payload>)
kind = 'cell_ref'     → (ax_origine, rubrique_code, colonne)
     | 'literal'      → literal_value: NUMERIC(28,8)
     | 'literal_text' → literal_text: TEXT  (triggers SKIP)
```

**D3.5 full DSL** must eventually support (§4 D3.5, Phase 2 §20):
- IF/THEN conditions
- Ensembles (sets)
- Pondérations (weighting)
- Buckets

Currently only **linear term aggregation** (+, -, *, /) is implemented per §9.4.

### 5.4 Concrete Examples (§15.5)
**Example 1 — Intra-annexe equality (majority case):** annexe 00 rule num 1: `AC050100000000.col8 == AC050100000000.col5`.

**Example 2 — Cross-annexe with literals (Ratio Liquidité circulaire 2014-14):** annexe 47 rule num 90, oper `MIN`, 5 terms spanning rangs 1, 2, 3 including literal 75 and literal 100.

**Example 3 — Conditional (208 cases, non-AST):** annexe 51 rule num 7, `zone_texte = "Si Σ de PR311+PR312+PR313-CH311 > 0 alors PR31 = ..."` — `is_formalized=FALSE`.

### 5.5 Operator Distribution (§9.4, §15.1)
| Operator | Rules | % | Implementation Priority |
|---|---|---|---|
| `=` | ~4,100 | 93% | **P0** |
| `>=` | 287 | 6.2% | **P0** |
| `SUM` | 404 | 2.2% | **P0** (same semantics as `=`) |
| `MAX` | 33 | 0.7% | P2 — semantics to confirm |
| `MIN` | 31 | 0.7% | P2 — semantics to confirm |
| `>` | 24 | 0.5% | P1 |
| `<=` | 14 | 0.3% | P1 |
| `VA` | 5 | 0.1% | P3 — presumed absolute value |

---

## 6. Evaluation Algorithm §9.4 (the 5 phases VERBATIM from doc)

### Phase A — PARSE XML
- **Input:** Batch of XML files (1..N).
- **Process:** For each XML: `xml[code_annexe][rubrique][colonne] = Decimal(valeur, prec=38)`. Normalize: strip ids, pad columns, UTF-8 encoding.
- **Output:** 3-level dict `xml[annexe][rubrique][colonne] → Decimal`.
- **Edge cases:** BOM tolerated, `"0"`/`"00"` alias map, column `"1"` vs `"01"` normalization.

### Phase B — GROUP RULES
- **Input:** RDG dataset (4,611 rules, 18,452 terms).
- **Process:** `rules = groupby(RDG, key=(LIB_ANNEXE, NUM_REGLE))`.
- **Output:** 4,611 rule groups of terms.
- **Edge case:** `NUM_REGLE` is NOT globally unique — must use composite key.

### Phase C — RESOLVE TERMS (per rule)
- **Input:** 1 rule + its N terms + parsed XML dict.
- **Process per term:**
  - If `COLONNE is null`:
    - Try `Decimal(RUBRIQUE)` → `kind='literal'`, value = constant.
    - Else → `kind='literal_text'`, **SKIP rule** (e.g. "1 ou 2").
  - Else:
    - `target = AX_ORIGINE` normalized via alias map.
    - If target annexe absent from batch → `status='xml_missing'` → **SKIP rule** (verdict: SKIPPED_MISSING_ANNEXE).
    - Else lookup `xml[target][RUBRIQUE][COLONNE]`:
      - Normalize column: strip leading zeros, then fallback zfill.
      - If rubrique absent → `status='rubrique_missing'` → **SKIP rule** (SKIPPED_MISSING_RUBRIQUE).
      - If colonne absent → `status='colonne_missing'` → **SKIP rule**.
- **Output:** Resolved numerical values per term, or SKIP verdict.
- **Edge cases:** Literal vs cell_ref disambiguation; cross-annexe lookup via `ax_origine`.

### Phase D — AGGREGATE BY RANG
- **Input:** Resolved terms per rule, grouped by `rang`.
- **Process:** For each rang, initialize `acc = 0`. For each (term_op, valeur):
  - `+` → `acc += v`
  - `-` → `acc -= v`
  - `*` → `acc = acc * v`
  - `/` → if `v == 0` → SKIP; else `acc = acc / v`
- **Output:** Decimal per rang (LHS, RHS, optionally rang 3).
- **Edge cases:** Division by zero → SKIP. Nullity constraint: rang 1 missing → treat as implicit 0 (17 cases).

### Phase E — COMPARE & VERDICT
- **Input:** LHS = aggregate(terms_rang_1); RHS = aggregate(terms_rang_2).
- **Process by `OPER_REGLE`:**
  - `=` → PASS iff LHS == RHS (**EXACT equality, no epsilon**)
  - `>=` → PASS iff LHS >= RHS
  - `<=` → PASS iff LHS <= RHS
  - `>` → PASS iff LHS > RHS
  - `<` → PASS iff LHS < RHS
  - `SUM` → PASS iff LHS == RHS (observed same as `=`)
  - `MAX` → **SKIP** — semantics to confirm with BCT expert
  - `MIN` → **SKIP** — semantics to confirm with BCT expert
  - `VA` → **SKIP** — presumed absolute value, to confirm
- **If `rule.zone_texte ≠ null`:** SKIP (pass to RuleLearnerAgent).
- **Output:** Verdict ∈ {PASS, FAIL, SKIPPED_*}.

**Zero-tolerance semantics (§9.4):** Python/JS Decimal 28+ digits perform additions/subtractions of 3-decimal XML values **mathematically exactly**. NO epsilon needed. Strict `==`. Field test confirmed: 1,014 PASS on sums of 2–31 terms, zero false positives due to rounding.

---

## 7. Verdict Categorisation §9.5

**Golden rule (§9.5):** No silent SKIPPED. Each skip is traced, explained, actionable.

| Verdict | Semantics | UI Action |
|---|---|---|
| **PASS** | Rule satisfied by XML data | Green row, clickable → calculation proof |
| **FAIL** | Regulatory gap detected | **Red blocking row** + Investigator Deep-Dive activated |
| **SKIPPED_MISSING_RUBRIQUE** | Rule references rubrique absent from XML | Yellow warning — confirm: legitimate non-declaration OR oversight? |
| **SKIPPED_MISSING_ANNEXE** | Rule points to annexe not in batch | Grey info — invite to upload missing report for complete audit |
| **SKIPPED_CONDITIONAL** (aka "non formalisée") | Rule with `ZONE_TEXTE` conditional OR operator `MAX`/`MIN`/`VA` not confirmed | "Awaiting formalization" badge — RuleLearnerAgent + human validation |
| **SKIPPED_UNSUPPORTED_OP** | Operator `MAX`/`MIN`/`VA` not yet implemented (§15.4) | Manual validation pending semantics confirmation |

### Severity (§15.4)
- `SEVERE` — regulatory violation (FAIL). Mandatory XML correction before BCT filing.
- No `ROUNDING` level (removed per D1.1/D1.2/D1.3).

### Attached Metadata (inferred from §9.4 pipeline + §9.6 POC output)
- Gap value (signed, e.g. +57,985 TND).
- Rule ID + annexe + num.
- LHS/RHS values computed.
- Status code for SKIP reason.
- Citation back to rule source (circulaire_id).

### POC Results (§9.6)
- Applicables: 1,054 rules
- PASS: 1,014 (96.2%)
- FAIL: 3 (0.3%) — all on annexe 630 rubrique `PA030202000000`
- SKIPPED: 37 (3.5%): 31 missing rubrique, 6 zone_texte conditional

---

## 8. Module Inventory — Part III (§12)

10 functional modules.

| # | Module | Responsibility | Key Dependencies |
|---|---|---|---|
| 1 | **Dashboard** (§12.1) | Real-time conformity overview | KPIs, alerts, trends 6mo, heatmap, PredictorAgent, inter-entity comparison |
| 2 | **Workspace** (§12.2) | Operational core: upload, validation, chat AI | Upload multi-format, versioning, live 13-agent progression, repair suggestions, sourced contextual chat |
| 3 | **Reports** (§12.3) | History, details, export | 10-section fixed report, clickable proofs, inter-annexe heatmap, deep-dive, PDF/A-3 signed, immutable replay |
| 4 | **Rules Management** (§12.4) | No-code CRUD of 4,611 rules tri-mode | Rules Explorer, Copilot mode, Learning mode, Expert mode, Proposed Rules, Rule Detail+History. 4-eyes, Silent Guardian, immutable history, retroactive 12mo impact, conflict detection |
| 5 | **Knowledge Base** (§12.5) | BCT repository (annexes, circulaires, dictionary) | 33+ annexes with XSD, circulaires library, data dictionary, XSD registry, i18n FR/AR/EN |
| 6 | **Entities & Tenants** (§12.6) | Hierarchical multi-entity management | Entity Tree, inheritance matrix, overrides, RLS isolation, multi-country |
| 7 | **Users & Access** (§12.7) | Users, roles, MFA | 4 RBAC roles, MFA mandatory for admins, personal audit trail, SSO (future) |
| 8 | **Audit & Compliance** (§12.8) | Immutable traceability | Audit log chained append-only, 10-year replay, 4-layer AI lineage, auditor exports |
| 9 | **AI Model Registry** (§12.9) | IA model governance (CTO only) | 4-stage promotion (research → canary → prod), golden tests, red team, prompts versioning |
| 10 | **Settings** (§12.10) | Personal preferences | Profile, notifications, language RTL/AR, keyboard shortcuts |

---

## 9. Personas & User Journeys (§11, §13)

### 9.1 Personas (§11) — 4 personas

**P1 — Compliance Officer** (§11.1, primary user)
- Profile: bank compliance manager, 10+ years BCT experience.
- Permissions: Upload · Validate rules · 4-eyes sign · Audit.
- Modules: Dashboard, Workspace, Reports, Rules, Audit, Settings.
- **Top 3 journeys:**
  1. Daily validation of BCT reports.
  2. Review IA-proposed rules.
  3. 4-eyes signature batches.

**P2 — Analyst** (§11.2, operational)
- Profile: junior/mid back-office analyst.
- Permissions: Upload · Consult · Dashboards · Export.
- Modules: Dashboard, Workspace, Reports, Settings.
- **Top 3 journeys:**
  1. Upload daily reports at correct dates.
  2. Monitor dashboards.
  3. Prepare ad-hoc reports for management.

**P3 — Admin / CTO** (§11.3)
- Profile: CTO or IT-compliance lead.
- Permissions: All Compliance + user management + annexe config + Model Registry.
- Modules: ALL.
- **Top 3 journeys:**
  1. Onboard new users.
  2. Import recent BCT circulaires.
  3. XSD and annexe management / system supervision.

**P4 — External Auditor** (§11.4)
- Profile: BCT auditor or external firm (KPMG, Deloitte, PwC).
- Permissions: Read-only · Audit logs · Replay · Export.
- Modules: Reports, Audit, Knowledge, Settings (read-only).
- **Top 3 journeys:**
  1. Periodic controls on BCT demand.
  2. Audit trail verification.
  3. Replay historical reports + export evidence.

### 9.2 Top User Journeys (§13)
**J1 — Daily Validation (Compliance Officer) §13.1:** Dashboard → Upload Zone → Split View Validation → Structure Check (if KO) → Report Detail → Calculation Proof (if errors) → Export Center.

**J2 — Add Rule Copilot Mode (Compliance Officer) §13.2:** Rules Explorer → Mode Copilot (IA dialog → AST build) → Proposed Rules → Rule Detail (4-eyes + Silent Guardian) → Audit Log verify.

**J3 — Batch Learning (Admin) §13.3 — DIFFERENTIATOR:** Upload PDF circulaire → Mode Learning (23 rules proposed by RuleLearnerAgent with score + citation) → Batch review + multi-select → 4-eyes batch sign → Golden Test Suite (Silent Guardian parallel) → 23 rules active + notification.

**J4 — External Audit (Auditor) §13.4:** Audit Log Viewer → Replay Engine (Q1 2026 bit-identical replay) → Lineage Viewer (model+prompt+rules+KB of era) → Report Detail → Compliance Reports (PDF/A-3 signed export).

---

## 10. Agents — Deterministic + Probabilistic (§7)

### 10.1 Synthetic Table — 13 Agents (§7.1)
| # | Agent | Responsibility | Uses LLM | Phase | New? |
|---|---|---|---|---|---|
| 1 | **Orchestrator** | Coordination, state machine | ✅ | Phase 3 | — |
| 2 | **Ingestor** | Parsing multi-format → JSON | ❌ | Phase 1 | — |
| 3 | **Structure Validator** | Full check 7 dimensions | ❌ | Phase 1 | 🆕 |
| 4 | **Schema Inferencer** | Missing XSD inference | ✅ | Phase 1 | 🆕 |
| 5 | **Indexer** | Chunking + embeddings pgvector | ❌ | Phase 1 | — |
| 6 | **Rule Learner** | No-code rule extraction | ✅ | Phase 5 | — |
| 7 | **Intra Validator** | Intra-annexe controls | ❌ | Phase 2 | — |
| 8 | **Inter Validator** | Inter-annexes controls | ❌ | Phase 2 | — |
| 9 | **Calculator** | Decimal.js deterministic calc | ❌ | Phase 2 | — |
| 10 | **Investigator** | Root cause analysis | ✅ | Phase 3 | — |
| 11 | **Predictor** | ML forecasting risks | ❌ | Phase 3 (impl.) | — |
| 12 | **Reporter** | World-class 10-section report | ✅ | Phase 3 | — |
| 13 | **Silent Guardian** | Invisible technical tests | ❌ | Phase 4 | 🆕 |

### 10.2 Deterministic vs Probabilistic (§7.3)
**8 Deterministic agents (no LLM):** Ingestor, Structure Validator, Indexer, Intra Validator, Inter Validator, Calculator, Predictor, Silent Guardian.
- Bit-identical results for same inputs.
- Mathematically auditable.
- Guarantees zero-hallucination.

**5 LLM agents (Claude Opus/Sonnet):** Orchestrator, Schema Inferencer, Rule Learner, Investigator, Reporter.
- Mandatory guardrails (citations + confidence ≥ 0.95).
- Human-in-the-loop on critical decisions.
- Full versioning for reproducibility.

### 10.3 Canonical I/O Contract (§7.2)
```typescript
interface Agent<Input, Output> {
  readonly id: AgentId;
  readonly version: string;
  readonly capabilities: Capability[];
  execute(input: Input, ctx: AgentContext): Promise<AgentResult<Output>>;
  validateInput(input: unknown): Result<Input, ValidationError>;
  validateOutput(output: unknown): Result<Output, ValidationError>;
}
interface AgentResult<T> {
  status: 'success' | 'failure' | 'partial';
  output: T;
  citations: Citation[];     // MANDATORY if LLM involved
  confidence: number;        // 0-1, reject if < 0.95 on critical
  tokensUsed: number;
  latencyMs: number;
}
```

### 10.4 Where They Live (§6.2 Couche 4)
All 13 agents are deployed as independent Edge Functions (Supabase Edge Functions / Deno TS) in "COUCHE 4 — AI Agents Layer".

> **NOTE ON USER'S SPEC:** The user prompt mentioned "8 deterministic agents from api + 5 LLM agents from chatbot-py". The doc describes all 13 agents as Supabase Edge Functions, not split between a Python chatbot repo and an API. There is NO mention in v1.1 of a `chatbot-py` folder or a Python LLM service separated from an `api` folder; the LLM stack is Claude (Opus 4.7 + Sonnet 4.6) via Anthropic API. This is flagged as an **open question** (§16 below).

---

## 11. UI/UX Principles §14

### 11.1 Philosophy (§14.1)
- **Apple Vision Pro glassmorphism** on white background.
- Minimalist, elegant, professional — reflecting banking compliance precision.
- **Principles:** Clarté, Élégance, Confiance, Fluidité, Accessibilité (WCAG AA).

### 11.2 Color Palette (§14.2)
```css
/* Backgrounds */
--bg-primary: #FFFFFF;
--bg-secondary: #FAFAFA;
--bg-tertiary: #F5F5F7;

/* Glassmorphism */
--bg-glass: rgba(255, 255, 255, 0.72);
--bg-glass-hover: rgba(255, 255, 255, 0.85);

/* Text */
--text-primary: #1D1D1F;
--text-secondary: #86868B;
--text-tertiary: #AEAEB2;

/* Status */
--status-success: #34C759;  /* OK */
--status-error: #FF3B30;    /* SEVERE */
--status-warning: #FF9500;  /* ROUNDING (legacy; post v1.1 no ROUNDING) */
--status-info: #007AFF;

/* Glass Effects */
--glass-blur: 20px;
--glass-saturation: 180%;
```

### 11.3 Typography (§14.3)
- **Primary:** SF Pro Display / Inter.
- **Monospace:** SF Mono / JetBrains Mono.
- **Arabic:** SF Arabic / Noto Sans Arabic.
- Modular scale ratio 1.25 (12px → 60px).

### 11.4 i18n (§14.1, §12.5, §12.10, §20 Phase 6)
- **Languages:** FR / AR (RTL) / EN.
- `next-intl` library (§5.1).
- AR mandates full RTL support.
- Multi-language RTL in Settings (§12.10).
- i18n systematic in Data Dictionary (§12.5).

### 11.5 Accessibility (§14.1)
- **WCAG AA** mandatory.
- Optimal contrast.
- Keyboard shortcuts (§12.10).

### 11.6 Key Components (§14.4)
- **Primitives:** GlassCard (variants: default, flat, elevated, interactive), Button (primary/secondary/ghost/outline/danger/success), Input, Select, Textarea, Checkbox, Switch, Badge, Modal (sm/md/lg/xl/full), Toast, Table.
- **Métier:** ConformityGauge, RuleASTViewer, RuleFormulaBuilder, ValidationSummary, UploadZone, ChatMessage + TypingIndicator, CalculationProofCard, InterAnnexeHeatmap, AgentPipelineStatus.

---

## 12. Integration Points (§5.1, §6.1, §10.1)

### 12.1 Postgres / Storage
- **Postgres 15** (Supabase, pgvector enabled) — §5.1.
- **Supabase Storage (AES-256 encrypted)** — §5.1.
- **Upstash Redis** — cache — §5.1.

### 12.2 LLM Providers
- **Claude Opus 4.7** (Anthropic) — primary — §5.1, §7.
- **Claude Sonnet 4.6** — secondary — §5.1.
- **Voyage-3 embeddings** (1024 dims) — §5.1.
- **Voyage Rerank** — §5.1.
- **Migration from Gemini to Claude** required (§19.1).
- **No Ollama** in v1.1 stack — **NOT SPECIFIED** in doc. Ollama was NOT mentioned anywhere in the master document.

### 12.3 Auth & Session
- **Supabase Auth + MFA TOTP** — §5.1, §10.1.
- **Migration from JWT artisanal** — §19.1.

### 12.4 Email / SMS
- **Resend** — email via Context diagram (§6.1 "Email/SMS (Resend)").
- SMS — **NOT SPECIFIED** beyond Resend label.

### 12.5 Storage Blob
- **Supabase Storage AES-256** (§5.1) — native.
- **URLs signed 15 min** (§10.1).
- **Azure Blob — NOT SPECIFIED** (not mentioned in doc).

### 12.6 Other
- **Cloudflare WAF + DDoS + CDN** — §5.1, §6.2 Couche 1.
- **Supabase Realtime** — live progression — §5.1, §5.2.
- **pgmq (Postgres Message Queue)** — §5.1.
- **Supabase Vault** — secrets — §5.1.
- **Snyk + Gitleaks + Semgrep** — scan deps — §5.1.

### 12.7 Observability
- **Pino → Logflare** (structured JSON) — §5.1.
- **Sentry** (APM + errors) — §5.1.
- **Better Stack** (uptime) — §5.1.
- **Grafana Cloud + Metabase** (dashboards) — §5.1.

### 12.8 DevOps
- **GitHub Actions** (CI/CD) — §5.1.
- **Terraform** (IaC) — §5.1.
- **Vercel** (FE deploy) — §5.1.
- **Supabase CLI** (BE deploy) — §5.1.
- **Vitest + Playwright** — §5.1.

### 12.9 Third-party APIs & Webhooks
- **Anthropic API** — Claude (critical dependency, see R8 §21).
- Webhooks — **NOT SPECIFIED** for inbound/outbound contracts.

---

## 13. Non-Functional Requirements

### 13.1 Performance (§9.3, §9.6)
| Metric | Target |
|---|---|
| Latency p50 validation XML 1MB | < 1.5s |
| Latency p95 | < 3s |
| Latency p99 | < 5s |
| Throughput per tenant | 1000 validations/h |
| Calculation precision | 100% vs expert manual |
| POC execution (4 annexes, 4611 rules) | **< 2 seconds** (§9.6) |

### 13.2 Precision (§3.3, §9.4, §changelog)
- **Decimal.js 28 digits MINIMUM** (Pillar 3).
- v1.1 uses **38 digits** (safety margin).
- Strict `==` equality — no epsilon.
- Zero tolerance on any non-null gap.

### 13.3 Immutable History (Pillar 6, §16.3, §20 Phase 3)
- `rules_history` versioned.
- `kb_snapshots` versioned.
- `prompts_registry` versioned.
- Replay engine — bit-identical 10 years.
- Rules NEVER deleted (10-year retention — §16.4).
- States: ACTIVE → DEPRECATED → ARCHIVED (§16.4).

### 13.4 RLS & Tenant Hierarchy (Pillar 7, §10.1)
- RLS 100% tables.
- Tenant hierarchy: parent + subsidiaries with inheritance and local overrides.
- Recursive resolution of rules through entity tree.

### 13.5 Success Metrics (§22)
- **Availability: > 99.95%** (§22.2).
- **Hallucination rate: 0%** (§22.2).
- **Golden suite pass rate: 100%** (§22.2).
- **P95 latency validation: < 3s** (§22.2).
- **Coverage tests: > 80%** (§22.2, §20 Phase 6).
- **Zero-hardcoding violations: 0** (§22.2).
- **Failed deployments: < 2%** (§22.2).
- **NPS tenant: > 60** (§22.1).
- **Churn mensuel: < 2%** (§22.1).
- **WAU/MAU: > 70%** (§22.1).

### 13.6 Security (§10)
- STRIDE model documented (§10.1).
- 5 Defensive Pillars Zero-Hallucination (§10.2):
  1. Mandatory grounding (≥1 KB citation).
  2. Calculation outside LLM.
  3. Confidence Threshold (reject if <0.95).
  4. Guardrail Validator middleware.
  5. Continuous Red Team in CI.
- MFA TOTP (§10.1).
- AES-256 storage (§10.1).
- Audit log chained append-only (§10.1, §12.8).
- PDF/A-3 signed reports (§10.1, §17.3).

---

## 14. Part II Originally — Now Superseded (§19.1)

Part II currently describes the **target** stack: Next.js 14 + Supabase (Postgres + RLS + Auth + pgvector + Edge Functions + Realtime + Storage + pgmq + Vault). Drizzle ORM, Claude API, Zustand, TanStack Query, shadcn/ui.

### 14.1 What existed before this document (per §19.1)
The "existing codebase" (~75% production-ready) was:
- Next.js 14 + TypeScript strict (conserved).
- **MySQL** → to replace with Postgres/Supabase.
- Drizzle ORM (conserved, to be adapted to Postgres).
- Tailwind CSS 3.4 (conserved).
- 19 basic API routes.
- `auditlog` structure.
- `fast-xml-parser`.
- **JWT artisanal auth** → to replace with Supabase Auth + MFA.
- **`/public/rdg_rules.json`** → to migrate to table `rules` versioned.
- **Gemini LLM** → to replace with Claude.
- **`safeEval()` regex-based** → to replace with RuleInterpreter AST.
- **localStorage auth** → to replace with httpOnly cookies.
- **Inline components** → to extract into `packages/ui`.
- **0 tests** → complete suite needed.

### 14.2 Migration posture (§19.2)
**Progressive, non big-bang.** Existing app continues to function while layers are refactored.

### 14.3 What stack must functionally replicate
The document does NOT flag the target Part II stack as "superseded". As of v1.1, the Next.js + Supabase stack IS the current target. **The user prompt's mention of "Part II originally specified — Next.js/Supabase — so we know what the new stack must replicate functionally" suggests a secondary reading: the user anticipates a pivot AWAY from Supabase.** This pivot is **NOT SPECIFIED** in the doc v1.1 — flagged as open question in §16.

---

## 15. Roadmap §20 (Part V) — 16 Weeks, 7 Phases (Phase 0..6)

### Phase 0 — Fondations (Weeks 1-2)
- Provisioning Supabase (dev/staging/prod).
- Setup monorepo Turbo.
- Extraction services existants dans `packages/legacy-services/`.
- CI/CD GitHub Actions.
- Sentry + Logflare + Better Stack.
- ADR #001 + #002.
- **Livrable:** Infrastructure prête, app existante migrée sans régression.

### Phase 1 — Migration Backend (Weeks 3-5)
- Schéma Drizzle Postgres complet (20+ tables).
- Migrations SQL versionnées.
- RLS 100% tables.
- Script migration MySQL → Postgres.
- JWT → Supabase Auth.
- Parsers multi-format (XML, PDF, XLSX, DOCX, PPTX).
- **StructureValidatorAgent** (nouveau prioritaire).
- Versionning uploads.
- **SchemaInferencerAgent** (nouveau).
- Import initial 4,611 règles XLSX.
- **Livrable:** Upload XML → validation structure + stockage KB.

### Phase 2 — Moteur de Validation (Weeks 6-8)
- DSL AST étendu (D3.5: IF/THEN, ensembles, pondérations, buckets).
- IntraValidator + InterValidator + Calculator.
- Résolution hiérarchique règles (D4.2).
- Détection conflits (D4.1).
- Clef composite rattachement (D2.5).
- **Livrable:** Validation complète XML avec règles intra + inter.

### Phase 3 — IA & Rapports (Weeks 9-11)
- OrchestratorAgent + state machine.
- InvestigatorAgent avec cutoff analysis.
- Guardrails zero-hallucination.
- ReporterAgent + 10 sections canoniques.
- Export PDF/A-3 signé.
- UI Workspace split-view.
- **Livrable:** Rapport world-class disponible.

### Phase 4 — Mode Copilot MVP (Weeks 12-13)
- Interface conversationnelle création règles.
- **SilentGuardianAgent** (nouveau).
- Test rétroactif sur dernier conforme.
- UI entities hiérarchiques.
- **Livrable:** Création de règles conversationnelle fonctionnelle.

### Phase 5 — Différenciateur Learning (Week 14)
- RuleLearnerAgent avancé.
- Parser PDF circulaires BCT.
- UI batch review tableau.
- Signature 4-yeux par lot.
- **Livrable:** Ajout de 23 règles depuis circulaire en < 30 min.

### Phase 6 — Hardening & GA (Weeks 15-16)
- Mode Expert (formulaire dense).
- Suite complète Vitest (coverage > 80%).
- Suite Playwright E2E (5 user journeys).
- Red-team adversarial tests.
- Rate limiting Upstash réel.
- Pen testing externe.
- Load testing k6 (1000 validations/h).
- Documentation complète.
- Formation équipe.
- Go-live production.
- **Livrable:** Version 1.0 production-ready pour FONGIP + QNB.

---

## 16. Open Questions & Ambiguities

Flag for CEO / Architect review.

1. **Stack Pivot (user prompt mismatch):** User prompt says "What Part II Said (now superseded)" — implying stack is changing AWAY from Next.js/Supabase. The v1.1 doc does NOT flag this; Supabase is the target. **Q:** Is there a newer decision post v1.1 to pivot stacks? If yes, to what?

2. **Python LLM service (user prompt mismatch):** User prompt mentions "8 deterministic agents from api + 5 LLM agents from chatbot-py". The doc has all 13 agents on Supabase Edge Functions (Deno TS). **Q:** Is there a separate Python microservice planned for LLM agents? If yes, why the split?

3. **Ollama / Gemini integration (user prompt mismatch):** User prompt lists "Ollama, Gemini" as integration points. Doc v1.1 **removes Gemini** (to be replaced by Claude — §19.1) and never mentions Ollama. **Q:** Is local LLM inference (Ollama) being added? For what purpose (data sovereignty?).

4. **Azure Blob (user prompt mismatch):** User prompt lists "Azure Blob" as integration. Doc uses Supabase Storage. **Q:** Azure migration planned? Tenancy on Azure for sovereignty reasons?

5. **MAX / MIN / VA operators:** Doc SKIPs these (~70 rules) pending BCT expert confirmation (§9.4, §15.1). **Q:** When will semantics be confirmed? Blocks ~1.5% of rules.

6. **`literal_text` rules:** 7 rows with values like `"1 ou 2"` — unformalized (§8.2). **Q:** RuleLearner pipeline or manual formalization?

7. **ZONE_TEXTE conditional rules (208):** Require RuleLearnerAgent formalization (§8.4). **Q:** What's the target timeline? Phase 5 is only 1 week.

8. **Annexe count discrepancy:** v1.0 said "~33 active", v1.1 measures 52 (§8.4). Module 5 still says "33+ annexes" (§12.5). **Q:** Confirm 52 is authoritative?

9. **Column normalization contract:** §4.7 says "strip leading zeros, then fallback zfill" — but what zfill length? 2? 3? **Q:** Specify normalization rule precisely.

10. **RBAC role count:** §10.3 lists 6 rows (Owner, Admin, Compliance Officer, Analyst, Auditor, Viewer) but header says "4 Rôles Standards". Module 7 (§12.7) says "4 rôles RBAC". **Q:** 4 or 6 roles?

11. **Row-level tenant on `rule_terms`:** `rule_terms` has no `tenant_id` column (§8.3). RLS likely via `rule_id` join. **Q:** Confirm RLS policy design.

12. **Tenants / entities schema:** Referenced repeatedly but no DDL provided. **Q:** Finalize entities schema incl. parent_entity_id, country, etc.

13. **`literal_value NUMERIC(28,8)` vs Decimal 38 prec:** Schema uses 28-digit precision but evaluation uses 38 (§changelog). **Q:** Align DB column precision to 38?

14. **`kb_chunks.exists`:** Guardrail pseudo-code (§10.2) references `db.kb_chunks.exists(cite.sourceId)` — schema not defined. **Q:** Finalize kb_chunks schema for citations.

15. **4-layer lineage (§12.8):** "Lineage 4 couches IA" — layers not enumerated. **Q:** Confirm what 4 layers compose lineage (model, prompt, rules, KB?).

16. **`num_seq` semantics for `*`/`/`:** Aggregation in §9.4 applies `*` and `/` sequentially in `num_seq` order — ensure commutativity isn't assumed. **Q:** Confirm left-to-right evaluation on mixed ops within a rang.

---

## 17. Terminology Glossary (§Annexe A + inline)

| Term | Definition |
|---|---|
| **BCT** | Banque Centrale de Tunisie — regulator (§preamble). |
| **BCEAO** | West African monetary union regulator — expansion target (§2.4). |
| **RDG** | Référentiel des règles (the XLSX of 4,611 rules); term used throughout §8-9. |
| **Annexe** | Rapport réglementaire BCT (e.g. 00, 51, 484, 620, 501, 630, 640) (§Annexe A, §8.5). |
| **Rubrique** | Hierarchical code (e.g. `AC050100000000`) identifying a data line (§8.2). |
| **Colonne** | Ventilation identifier within an annexe (brut/provisions/net, residents/non-residents, devises) (§8.1). |
| **Rang** | Equation member: 1=LHS, 2=RHS, 3=rare (§8.1 — 6th dimension). |
| **Term** | Unit of an equation (kind: cell_ref / literal / literal_text) (§8.3). |
| **Circulaire** | BCT source document defining rules (§Annexe A). |
| **Intra-annexe** | Control inside a single report (§Annexe A). |
| **Inter-annexes** | Cross-report coherence control (§Annexe A). |
| **DSL** | Domain Specific Language — AST JSON of rules (§Annexe A). |
| **AST** | Abstract Syntax Tree — tree representation (§Annexe A). |
| **Verdict** | PASS / FAIL / SKIPPED_* (§9.5). |
| **Tolérance** | Legacy concept REMOVED per D1.1/D1.2/D1.3 — zero tolerance absolute (§3.1, §15.4). |
| **4-yeux** | Dual control principle (2 mandatory signatures) (§Annexe A). |
| **Silent Guardian** | Post-signature invisible technical tests (§3.5, §12.4). |
| **Zero-Hallucination** | Guarantee that LLM never fabricates numbers — citation required (§3.3, §10.2). |
| **HQLA** | High Quality Liquid Assets (§Annexe A). |
| **LCR** | Liquidity Coverage Ratio (§Annexe A). |
| **NSFR** | Net Stable Funding Ratio (§Annexe A). |
| **Tier 1** | Capital Tier 1 per Basel III (§Annexe A). |
| **RLS** | Row-Level Security — tenant isolation (§Annexe A, §10.1). |
| **SEVERE** | Regulatory violation; FAIL verdict (§15.4). |
| **ROUNDING** | Legacy severity level — REMOVED in v1.1 (§15.4). |
| **RAG** | Retrieval Augmented Generation (§Annexe A). |
| **MFA** | Multi-Factor Authentication (§Annexe A). |
| **RBAC** | Role-Based Access Control (§Annexe A). |
| **ADR** | Architecture Decision Record — required for any deviation from the 16 decisions (§4). |
| **AX_ORIGINE** | Source annexe of a term (always literal — §8.6). |
| **NUM_REGLE** | Local-to-annexe rule number (not globally unique; 962 distinct values for 4,611 rules — §8.3). |
| **TYPE_CTRL** | Control type tag (`intra_ax`/`inter_ax`) — indicative, not authoritative (§8.6). |
| **ZONE_TEXTE** | Free-text IF/THEN condition on a rule — triggers non-formalization (§8.3, §15.5). |
| **Zero-Tolerance** | Maximalist regulatory position — no epsilon, no rounding allowance (§3.1, §9.4). |
| **Immutable History** | Reports frozen to rules of their era; 10-year bit-identical replay (§3.6, §16.3). |

---

## Top-5 Critical Facts for Implementation Team

The evaluation engine is the heart of the product and is now fully specified: **the five-phase algorithm (Parse → Group → Resolve → Aggregate → Compare, §9.4) has been proven on a real 2024-03-31 BCT reporting with 4,611 rules in under 2 seconds**, using Decimal at 38-digit precision with **strict `==` equality and zero epsilon** (Pillar 1, D1.1-D1.3) — rules with `MAX`/`MIN`/`VA` operators or non-null `ZONE_TEXTE` must be explicitly routed to SKIPPED_* verdicts (never silent). The data model hinges on the **corrected `rules` + `rule_terms` split** (§8.3) where each rule's terms carry a mandatory **`rang` dimension (LHS=1, RHS=2, rare=3)** — without it you cannot distinguish `A=B+C` from `A+B=C` — and `(annexe_code, num_regle)` is the composite natural key because `num_regle` repeats across annexes (962 distinct values for 4,611 rules). The product's seven non-negotiable pillars (§3) force three architectural decisions before writing any code: **zero-hardcoding means rules/rubriques/prompts all live in Postgres tables (never in JSON/code), zero-hallucination means LLMs compute nothing (Decimal.js + mandatory citations + 0.95 confidence threshold), and immutable history means `rules_history` + `kb_snapshots` + `prompts_registry` are versioned for bit-identical 10-year replay**. The target stack (§5.1) is Next.js 14 App Router + Supabase (Postgres 15 + pgvector + RLS + Edge Functions + Auth MFA) + Drizzle + Claude Opus 4.7/Sonnet 4.6 — the 13 agents (8 deterministic, 5 LLM — §7) are each deployed as an Edge Function with the typed `Agent<Input, Output>` contract; note there is no Python service, no Ollama, and no Azure Blob specified in v1.1 despite the user prompt's hints (§16 open questions). Finally, the 16-week roadmap (§20) sequences work strictly: **Phase 1 migrates MySQL→Postgres + imports the 4,611-rule RDG + builds StructureValidator/SchemaInferencer; Phase 2 builds the validation engine (IntraValidator, InterValidator, Calculator); Phase 3 adds the LLM agents (Orchestrator, Investigator, Reporter) and the 10-section PDF/A-3 world-class report; Phases 4-5 deliver the Copilot and Learning rule-creation modes (the commercial moats)** — implementation teams must NOT reorder these phases because Phase 2's engine depends on Phase 1's data model, and the guardrails in Phase 3 depend on the guaranteed numerical precision established in Phase 2.
