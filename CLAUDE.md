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
- ❌ Composants Angular inline → factorisation dans `packages/ui-components`
- ❌ Limite arbitraire de 100 rapports par batch → queue (pgmq / BullMQ)
- ❌ Gemini/Ollama appelé depuis le frontend → backend uniquement
- ❌ Mélanger `number` (float) et `Decimal` pour les montants → Decimal partout
- ❌ `any` / `@ts-ignore` sans commentaire motivé
- ❌ Tests mockant la DB sur la logique d'évaluation → intégration Postgres réelle

---

## 🧱 Stack non négociable

Voir `README.md#stack`. Toute dérogation → ADR obligatoire avant merge.

- Pas de `next.js`, pas de `react`, pas de `drizzle`, pas de Supabase client, pas
  de Vercel — ces choix v1 ont été **remplacés** (cf. ADR 0001).

---

## 📍 Où trouver quoi

| Besoin                         | Emplacement                                             |
|--------------------------------|---------------------------------------------------------|
| Vision produit, roadmap        | `docs/architecture/00-master-document.md` (v1.1)        |
| Extraction structurée du doc   | `docs/architecture/01-extracted-facts.md`               |
| Décisions architecturales      | `docs/adr/`                                             |
| Règles RDG source              | `tests/fixtures/rdg.xlsx`                               |
| XMLs golden (POC 2024-03-31)   | `tests/fixtures/golden/bank-23/2024-03-31/`             |
| 8 agents déterministes         | `apps/api/src/agents/` (Phase 2)                        |
| 5 agents LLM                   | `apps/chatbot-py/app/agents/` (Phase 4)                 |
| Pipeline RAG                   | `apps/chatbot-py/app/rag/` (Phase 4)                    |
| Interface LLMClient            | `apps/chatbot-py/app/llm/base.py` (Protocol + Response) |

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
