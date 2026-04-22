# Instructions permanentes pour les sessions Claude Code

> Ce fichier est lu à chaque démarrage de session. Il contient les contraintes
> **non négociables** du projet Regalica IDC. Toute proposition qui les enfreint
> doit être rejetée ou renvoyée à un ADR.

---

## 🛡️ Les 7 Piliers Inviolables (master doc §3)

1. **ZERO TOLERANCE** — tout écart non nul = SEVERE. Pas d'epsilon. Decimal 38
   digits (Node `decimal.js` `{precision: 38}`, Python `decimal.getcontext().prec=38`).
2. **ZERO HARDCODING** — règles, rubriques, prompts LLM, XSD tous en DB.
   **Aucun `if (rubrique === '…')` ni règle en JSON statique.**
3. **ZERO HALLUCINATION** — LLM ne calcule **jamais**. Chaque réponse IA porte
   ≥ 1 citation vérifiable dans la KB (`kb_chunks.id`). Confiance < 0.95 sur
   topic critique → rejet.
4. **SUGGEST DON'T REPAIR** — l'IA suggère, l'humain corrige son XML lui-même.
   Chaque tentative est versionnée (`upload_versions`).
5. **SILENT GUARDIAN** — tests techniques en arrière-plan après signature
   4-yeux. Modal non bloquant si alerte.
6. **IMMUTABLE HISTORY** — rapports validés figés aux règles de leur époque.
   Tables versionnées (`rules_history`, `prompts_history`, `kb_snapshots`).
   Reproductibilité bit-identique 10 ans.
7. **HIERARCHICAL TENANCY** — tenant hiérarchique (maison-mère → filiales)
   avec héritage règles et overrides locaux.

---

## 🚫 Anti-patterns interdits (détectés dans l'ancienne codebase v1)

- ❌ `/public/rdg_rules.json` ou JSON de règles servi en statique
- ❌ `localStorage` pour auth tokens → cookies `httpOnly + Secure + SameSite=Strict`
- ❌ `safeEval()` / regex DSL pour interpréter les règles → AST parsing strict
- ❌ `console.log` en code de prod → Pino (Node) / structlog (Python)
- ❌ Pagination in-memory (`.slice(0, 100)`) → cursor-based DB pagination
- ❌ Composants inline sans package → factorisation dans `packages/ui` (shadcn/ui étendu)
- ❌ Limite arbitraire de 100 rapports par batch → queue (pgmq / BullMQ)
- ❌ Gemini/Ollama appelé depuis le frontend → backend uniquement
- ❌ Mélanger `number` (float) et `Decimal` pour les montants → Decimal partout
- ❌ `any` / `@ts-ignore` sans commentaire motivé
- ❌ Tests mockant la DB sur la logique d'évaluation → intégration Postgres réelle

---

## Stack v2.0 (ADR 0005 — supersede ADR 0001)

Stack production **non négociable** depuis le 2026-04-20. Toute dérogation → ADR obligatoire.

**Frontend :** Next.js 14 App Router · TypeScript 5.3 strict · Tailwind 3.4 · shadcn/ui · Lucide Icons · next-intl (FR/AR/EN + RTL) · Zustand · TanStack Query · Zod · Framer Motion (whitelist §14 uniquement)

**Backend :** PostgreSQL 15 (auto-heberge) · pgvector · Drizzle ORM · Next.js API routes (BFF) · Keycloak (auth MFA, OIDC) · MinIO (stockage XML) · pgmq (queues)

**IA :** Claude Opus 4.7 (primaire) · Sonnet 4.6 (secondaire) · Voyage-3 embeddings · XState state machines

**DevOps :** Turborepo · GitHub Actions · Vercel · Docker Compose (dev) · Terraform

**Service IA Python :** `apps/chatbot-py` (FastAPI + SQLAlchemy 2.0) reste indépendant — ne pas migrer.

**Prototype Angular :** `apps/frontend` figé en maintenance — référence UX uniquement, pas de nouvelle feature.

**Interdits absolus (non-négociables) :**
- Emoji n'importe où : UI, code, commentaires, commits, ADRs, logs, PDF (linter CI `eslint-plugin-no-emoji`)
- `console.log` / `print()` en prod → Pino (Node) / structlog (Python)
- `any` / `@ts-ignore` sans justification inline
- `localStorage` pour auth → cookies httpOnly (Keycloak OIDC)
- `eval()` / `new Function()` → RuleInterpreter AST
- JSON de règles hardcodé → tables `rules` + `rule_terms`
- Design token (hex, rem, px, ms) en dur → table `design_tokens` + CSS vars générées
- Règle / rubrique / annexe hardcodée → 12 interdictions (ADR 0002, linter CI)

---

## 📍 Où trouver quoi

| Besoin                         | Emplacement                                             |
|--------------------------------|---------------------------------------------------------|
| Vision produit, roadmap        | `docs/architecture/00-master-document.md` (v1.1)        |
| Extraction structurée du doc   | `docs/architecture/01-extracted-facts.md`               |
| Décisions architecturales      | `docs/adr/` (0001–0008)                                 |
| Plan Phase 0                   | `docs/plans/phase-0-foundations.md`                     |
| Design tokens v2.0             | `docs/design/00-tokens.md`                              |
| Matériaux glass v2.0           | `docs/design/01-materials.md`                           |
| Composants primitifs v2.0      | `docs/design/02-components.md`                          |
| Popups/sheets métier v2.0      | `docs/design/03-popups.md`                              |
| Règles RDG source              | `tests/fixtures/rdg.xlsx`                               |
| XMLs golden (POC 2024-03-31)   | `tests/fixtures/golden/bank-23/2024-03-31/`             |
| Agents déterministes (proto)   | `apps/api/src/agents/` (à porter dans `packages/agents`)|
| Agents LLM                     | `apps/chatbot-py/app/agents/`                           |
| Pipeline RAG                   | `apps/chatbot-py/app/rag/`                              |
| Interface LLMClient            | `apps/chatbot-py/app/llm/base.py` (Protocol + Response) |
| Frontend v2.0 (Next.js)        | `apps/web/` (Phase 0+)                                  |
| Schéma DB Drizzle              | `packages/db/src/schema/`                               |
| Design system composants       | `packages/ui/src/`                                      |
| Persona Regalica               | `packages/persona-regalica/`                            |

---

## ⚙️ Conventions de code

- **TypeScript strict** (cf. `tsconfig.base.json`) : pas de `any`, pas de
  `@ts-ignore` sans commentaire, `exactOptionalPropertyTypes`.
- **Python typé** : `mypy --strict` doit passer. pydantic 2 partout pour les
  DTOs externes.
- **Fichiers < 300 lignes** (règle SonarQube). Split en modules.
- **Commits : Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`,
  `test:`, `chore:`).
- **Logs** : Pino (Node) ou structlog (Python). Interdiction absolue de
  `console.log` / `print()` en prod.

## 🧪 Tests

- **TDD privilégié** sur l'évaluateur et les parsers : types → tests → code.
- **Golden tests obligatoires** : reproduire les 1 014 PASS / 3 FAIL sur
  `tests/fixtures/golden/bank-23/2024-03-31/` bit-identique. Un commit qui
  casse ça est refusé.
- **Couverture min 80 %** sur la logique métier (agents, evaluator, RDG parser).

## 🔐 Sécurité

- Jamais de secret en clair dans le repo. `.env` (dev) ou Secret Manager (prod).
- Pas de `eval()`, `new Function()`, `SECURITY DEFINER` sans audit.
- RLS activée sur 100 % des tables portant de la donnée tenant (ADR 0003).

## 🌍 i18n

- FR par défaut (marché primaire), AR (RTL) et EN obligatoires dès que l'UI
  stabilise.

---

## 🤖 Pour toi, Claude — règles de collaboration

- **Pas de décision structurante silencieuse.** Face à un choix non tranché
  (ex : npm vs pnpm, Dockerfile layout), propose + attends validation.
- **Ping à chaque étape majeure** avec un récap court + la commande suivante
  que tu t'apprêtes à lancer, pour que l'humain puisse stopper si ça dérape.
- **Ne merge jamais automatiquement** une PR — toujours laisser un humain valider.
- **Pas de bypass** : si un hook pre-commit échoue, fixe la cause, ne passe pas
  `--no-verify`.
- **Respect des ADRs** : si tu penses qu'un ADR doit évoluer, propose-le dans
  un nouveau fichier ADR qui supersede l'ancien — ne modifie pas un ADR
  accepté.
