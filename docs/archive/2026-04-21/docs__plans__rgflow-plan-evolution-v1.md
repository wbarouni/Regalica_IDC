# Regalica IDC — Plan d'Évolution rgflow v1.0
<!-- Date: 2026-04-20 | Auteur: Claude Sonnet 4.6 (sub-agents architect-rgflow + design-regalica) -->
<!-- Supersede: docs/plans/phase-0-foundations.md (Phase 3+) -->

---

## Contexte

Ce document consolide les livrables des deux sous-agents spécialisés :
- **architect-rgflow** — plan technique backend/infrastructure (5 phases)
- **design-regalica** — spec UI/UX + grammaire conversationnelle Regalica

### Périmètre

La plateforme Regalica IDC dispose d'un pipeline d'évaluation RDG **validé et fonctionnel** :
- Per-annexe filtering (AX_TERM matching)
- Cross-annexe dependency detection (requiredAnnexes)
- Baseline immuable : 937 PASS / 2 FAIL / 3 672 SKIP sur 5 XMLs golden bank-23/2024-03-31

Ce plan porte sur l'évolution de l'orchestration IA, de la persistance, du design system et de la grammaire conversationnelle. **Le pipeline d'évaluation déterministe ne sera pas modifié.**

### Contraintes non-négociables (ADR 0005 + 7 Piliers)

| Contrainte | Règle |
|---|---|
| Decimal 38 digits | Decimal.js `{precision: 38}` + ROUND_HALF_EVEN partout |
| Zero hardcoding | Règles, rubriques, prompts LLM, seuils → DB uniquement |
| Zero hallucination | LLM ne calcule jamais, ≥1 citation KB par réponse, confiance < 0.95 → rejet |
| Suggest, don't repair | IA suggère, humain corrige le XML |
| Immutable history | Rapports validés figés, `rules_history` append-only |
| Golden suite | 937 PASS / 2 FAIL / 3 672 SKIP — bit-identique, jamais cassé |
| Emoji | Interdit partout (linter CI) |
| Icons | Lucide React uniquement, zéro inline SVG |

---

## Vue d'ensemble — 5 phases

```
Phase 1 — Reliability & Observability     (S1–S2)  · 2 semaines
Phase 2 — Context & Memory                (S3–S5)  · 3 semaines
Phase 3 — Persistence & Realtime          (S6–S7)  · 2 semaines
Phase 4 — Cross-Annexe Orchestration      (S8–S10) · 3 semaines
Phase 5 — Enterprise Auth & Audit         (S11–S14)· 4 semaines
```

---

# PARTIE A — Plan Technique (architect-rgflow)

## Phase 1 — Reliability & Observability

### Objectif
Rendre les appels LLM robustes (retry + circuit-breaker) et traçables (logs structurés avec correlation IDs).

### 1.1 Retry + Circuit-Breaker pour les appels Gemini

**Fichiers à créer/modifier :**
- `apps/web/src/lib/llm/gemini-client.ts` — wrapper Gemini avec retry
- `apps/web/src/lib/llm/circuit-breaker.ts` — circuit-breaker pattern
- `apps/web/src/app/api/chat/route.ts` — utiliser le wrapper

**Implémentation :**

```typescript
// apps/web/src/lib/llm/gemini-client.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CircuitBreaker } from './circuit-breaker';

interface RetryConfig {
  maxAttempts: number;    // 3
  baseDelayMs: number;    // 1000
  maxDelayMs: number;     // 10000
  backoffFactor: number;  // 2
}

const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, backoffFactor: 2 };

export async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY
): Promise<T> {
  let lastError: Error;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < config.maxAttempts) {
        const delay = Math.min(config.baseDelayMs * Math.pow(config.backoffFactor, attempt - 1), config.maxDelayMs);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  throw lastError!;
}
```

```typescript
// apps/web/src/lib/llm/circuit-breaker.ts
type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CBState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeoutMs = 60_000
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit OPEN — service Gemini temporairement indisponible');
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() { this.state = 'CLOSED'; this.failureCount = 0; }
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) this.state = 'OPEN';
  }
}
```

**Dépendances à installer :** aucune (implémentation native TypeScript)

**Critères d'acceptance :**
- [ ] Test : 3 appels successifs en erreur → circuit s'ouvre
- [ ] Test : après `resetTimeoutMs`, circuit passe en HALF_OPEN
- [ ] Test : appel réussi en HALF_OPEN → circuit se ferme
- [ ] `apps/web/src/app/api/chat/route.ts` utilise `callGeminiWithRetry`

### 1.2 Structured Logging avec Correlation IDs

**Fichiers à créer/modifier :**
- `apps/web/src/lib/logger.ts` — Pino logger server-side
- `apps/web/src/middleware.ts` — injecter `x-correlation-id` header

**Dépendances :** `pnpm add pino pino-pretty` dans `apps/web`

**Règle :** `console.log` interdit partout → `logger.info/warn/error`

**Critères d'acceptance :**
- [ ] Chaque requête API porte un `correlationId` UUID dans les logs
- [ ] Erreurs LLM loguées avec `{ correlationId, attempt, delayMs, errorCode }`

### 1.3 Error Boundaries Next.js

**Fichiers à créer :**
- `apps/web/src/app/error.tsx` — global error boundary
- `apps/web/src/app/app/error.tsx` — error boundary pour `/app`

**Critères d'acceptance :**
- [ ] Erreur 500 dans `runAnalysis()` → affiche message Regalica dans le chat (pas blank screen)

---

## Phase 2 — Context & Memory

### Objectif
Gérer le contexte multi-tour intelligemment, valider les citations BCT, et robustifier l'embedder.

### 2.1 Multi-turn Context Window

**Problème :** le contexte chat grandit sans limite → tokens Gemini saturés.

**Solution :** sliding window de 8 messages maximum + résumé automatique au-delà.

**Fichiers à modifier :**
- `apps/web/src/app/api/chat/route.ts` — ajouter `trimContext()`
- `apps/web/src/lib/llm/context-manager.ts` — nouveau

```typescript
// apps/web/src/lib/llm/context-manager.ts
export interface ChatMessage { role: 'user' | 'assistant'; content: string; }

const MAX_WINDOW = 8; // messages to keep (must start with user turn)

export function trimContext(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_WINDOW) return messages;
  const window = messages.slice(-MAX_WINDOW);
  const firstUserIdx = window.findIndex(m => m.role === 'user');
  return firstUserIdx >= 0 ? window.slice(firstUserIdx) : window;
}
```

**Critères d'acceptance :**
- [ ] 20 messages d'historique → `trimContext` retourne ≤ 8 messages commençant par 'user'
- [ ] Golden test : réponse avec contexte tronqué ne diffère pas semantiquement

### 2.2 Citation Validation

**Problème :** Regalica cite des articles BCT sans vérification que la citation existe dans `kb_chunks`.

**Contrainte Pilier 3 :** chaque réponse IA porte ≥ 1 citation vérifiable dans `kb_chunks.id`.

**Fichiers à créer :**
- `apps/web/src/lib/agents/citation-validator.ts` — vérifie que les citations sont dans la KB

**Note :** implémentation complète requiert connexion Supabase active avec table `kb_chunks`. À implémenter en Phase 3 (après persistence).

### 2.3 Embedder Fallback Chain

**Contexte chatbot-py :** `apps/chatbot-py/app/rag/embedder.py` utilise `text-embedding-004` (768 dims) avec fallback hash.

**Amélioration :** fallback chain explicite : primary (Voyage-3) → secondary (text-embedding-004) → hash (stable UUID v5 from text).

**Fichiers à modifier :**
- `apps/chatbot-py/app/rag/embedder.py` — ajouter Voyage-3 comme primary, reordonner chain

**Critères d'acceptance :**
- [ ] Test : Voyage-3 indisponible → bascule text-embedding-004 sans erreur
- [ ] Test : les deux indisponibles → hash fallback, log WARNING

---

## Phase 3 — Persistence & Realtime

### Objectif
Persister les runs d'évaluation dans Supabase, activer les subscriptions Realtime, implémenter pgmq.

### 3.1 Persister les validation_runs

**Contexte :** la table `validation_runs` existe en DB (migration 004) mais la route `/api/evaluate` n'écrit rien.

**Fichiers à modifier :**
- `apps/web/src/app/api/evaluate/route.ts` — appel Supabase après `runEvaluation()`
- `packages/db/src/schema/validation-runs.ts` — schéma Drizzle (à créer si absent)

**Schéma run à persister :**
```typescript
{
  id: crypto.randomUUID(),
  tenant_id: '00000000-0000-0000-0000-000000000001',
  uploaded_annexes: [...uploadedAnnexeCodes].sort(),
  required_annexes: [...requiredAnnexes].sort(),
  total_rules: relevantRules.length,
  pass_count: result.summary.pass,
  fail_count: result.summary.fail,
  skip_count: result.summary.skip,
  created_at: new Date().toISOString(),
  status: 'COMPLETE',
}
```

**Critères d'acceptance :**
- [ ] POST `/api/evaluate` → ligne créée dans `validation_runs`
- [ ] RLS : un tenant ne voit pas les runs d'un autre

### 3.2 Supabase Realtime pour le progress

**Problème :** le progrès des 4 étapes pipeline est local (useState). Les autres onglets/sessions ne voient pas.

**Solution :** émettre des events Supabase Realtime sur le canal `validation:{runId}` à chaque étape.

**Dépendances :** `pnpm add @supabase/supabase-js` dans `apps/web`

**Critères d'acceptance :**
- [ ] Deux onglets ouverts sur `/app` : un upload → l'autre voit le progress en live

### 3.3 pgmq pour les évaluations asynchrones

**Contexte :** pour les gros batches XML (> 5 fichiers), l'évaluation doit être asynchrone.

**Approche :** endpoint `/api/evaluate` enqueue dans pgmq → Edge Function consomme → Realtime notifie.

**Note :** pgmq est disponible via Supabase extensions. Configuration en ADR 0009 requis avant implémentation.

**Critères d'acceptance :**
- [ ] Batch > 5 XMLs → réponse 202 Accepted avec `runId`
- [ ] Client poll Realtime sur `validation:{runId}` jusqu'à status `COMPLETE`

---

## Phase 4 — Cross-Annexe Orchestration

### Objectif
Implémenter la boucle d'accumulation des XMLs pour les contrôles inter-annexes, avec Regalica comme orchestratrice.

### 4.1 Session State persistant (XMLs accumulés)

**Problème actuel :** si l'utilisateur charge annexe 630 → Regalica demande annexe 00 → l'utilisateur charge annexe 00 → tout repart de zéro au lieu de réutiliser les données d'annexe 630.

**Solution :** `sessionStorage` (temporaire, one-browser) ou Supabase `validation_sessions` table.

**Fichiers à créer/modifier :**
- `apps/web/src/lib/stores/session-store.ts` — Zustand store avec accumulateur de fichiers
- `apps/web/src/app/app/page.tsx` — `addFiles()` au lieu de `setFiles()` au drop

```typescript
// apps/web/src/lib/stores/session-store.ts
import { create } from 'zustand';

interface SessionState {
  accumulatedFiles: Map<string, File>; // filename → File
  addFiles: (files: File[]) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  accumulatedFiles: new Map(),
  addFiles: (files) => set((state) => {
    const next = new Map(state.accumulatedFiles);
    files.forEach(f => next.set(f.name, f));
    return { accumulatedFiles: next };
  }),
  clearSession: () => set({ accumulatedFiles: new Map() }),
}));
```

**Critères d'acceptance :**
- [ ] Charge annexe 630 (339 règles, `requiredAnnexes: ['0']`)
- [ ] Regalica demande annexe 00
- [ ] Utilisateur drop annexe 00 → ré-évaluation automatique avec les 2 XMLs accumulés
- [ ] Résultat : 339 + 614 = 953 règles, `requiredAnnexes: []`

### 4.2 Re-évaluation automatique sur nouvel upload

**Fichiers à modifier :**
- `apps/web/src/app/app/page.tsx` — `useEffect` sur `accumulatedFiles.size` → déclencher `runAnalysis()`

**Règle :** Regalica annonce l'ajout : _"Annexe 00 reçue. Lancement des contrôles croisés..."_

### 4.3 Missing Annexe Progress Tracker

**Composant :** `MissingAnnexeBanner` — barre sticky sous le CommandBar listant les annexes manquantes avec des boutons upload ciblés.

```
Contrôles croisés en attente · Annexes requises : [00] [520] — Glissez les fichiers ci-dessous
```

**Critères d'acceptance :**
- [ ] Banner visible uniquement si `requiredAnnexes.length > 0`
- [ ] Disparaît automatiquement quand toutes les annexes requises sont chargées

---

## Phase 5 — Enterprise Auth & Audit

### Objectif
SSO SAML/OIDC via Keycloak (banques entreprises), audit 10 ans, workflow 4-yeux.

### 5.1 Keycloak SAML/OIDC

**Stack auth cible (ADR 0005) :** Keycloak (MFA TOTP + SAML/OIDC)

**Fichiers à créer :**
- `apps/web/src/lib/auth/keycloak-client.ts` — wrapper OIDC
- `apps/web/src/middleware.ts` — vérification session + role extraction

**Note :** Keycloak remplace Supabase Auth mentionné dans le plan principal. ADR 0010 requis.

### 5.2 Audit Log 10 ans

**Table `regalica_responses_audit` :** append-only, chaque réponse Regalica loguée.

**Fichiers à modifier :**
- `apps/web/src/app/api/chat/route.ts` — écriture en `regalica_responses_audit` après chaque réponse

**Champs :** `{ id, tenant_id, session_id, correlation_id, model, prompt_hash, response_hash, confidence, citation_ids, created_at }`

### 5.3 Workflow Four-Eyes (FourEyesSignatureModal)

**Modal `FourEyesSignatureModal` :** déclenché après validation complète pour signature à 4 yeux avant archivage.

**Flux :**
1. Validation COMPLETE → bouton "Soumettre pour signature" activé
2. Superviseur 1 signe (TOTP)
3. Superviseur 2 signe (TOTP différent)
4. Rapport figé dans `validation_runs` avec `status: 'SIGNED'`
5. `rules_history` snapshot créé (Pilier 6)

---

# PARTIE B — Plan Design (design-regalica)

## Section A — Component Inventory & Spec

### A.1 XmlViewer

**Props :**
```typescript
interface XmlViewerProps {
  file: File;
  defaultTab?: 'tree' | 'table' | 'raw';
  className?: string;
  onClose?: () => void;
}
```

**Visual :** `GlassCard` variant `regular` (backdrop-blur-20, bg `rgba(255,255,255,0.65)`), right-sliding Sheet 560px. Header 56px : filename `font-semibold text-[--mono-graphite]` + `X` close.

**3 onglets (pill-group, 36px) :**
- **Tree** : arbre DOM récursif, expand/collapse `ChevronRight`/`ChevronDown` 12px `--mono-steel`, noms d'éléments `--brand-navy font-mono text-sm`, valeurs `--functional-pass` (strings) / `--brand-violet` (numbers), indentation `pl-4` par niveau, profondeur initiale 3.
- **Table** : liste rubrique → valeur, colonnes `Code | Libellé | Valeur | Type`, sticky header chrome, tri par code alphabétique.
- **Raw** : textarea read-only `font-mono text-xs`, syntax highlighting via `--brand-navy` (tags), `--brand-violet` (valeurs), line numbers `--mono-steel`.

**Icônes Lucide :** `ChevronRight`, `ChevronDown`, `Table2`, `Code`, `TreeDeciduous`, `X`

**Behaviour :**
- Parsing XML client-side via `DOMParser`
- Tab `raw` lazy : parse uniquement à l'activation
- Scroll indépendant par tab (overflow-y-auto)

---

### A.2 AgentStepper

**Props :**
```typescript
interface AgentStep {
  id: string;
  label: string;
  icon: LucideIcon;
  state: 'pending' | 'active' | 'done' | 'error';
  durationMs?: number;
  detail?: string;
}
interface AgentStepperProps {
  steps: AgentStep[];
  className?: string;
}
```

**Visual :** liste verticale dans le panneau gauche, chaque step = ligne 40px.

| State | Icône | Couleur icône | BG ligne | Label color |
|---|---|---|---|---|
| pending | `Circle` | `--mono-silver` | transparent | `--mono-steel` |
| active | `Loader2` (spin) | `--brand-violet` | `--brand-violet-bg` | `--mono-graphite` |
| done | `CheckCircle2` | `--functional-pass` | transparent | `--mono-graphite` |
| error | `AlertCircle` | `--functional-fail` | `rgba(255,59,48,0.06)` | `--functional-fail` |

**Duration badge :** si `durationMs`, affiché `text-xs --mono-steel` à droite. Ex : `1.2s`

**Detail expandable :** si `detail`, `ChevronDown` bouton → expand zone grise `text-xs font-mono --mono-steel` avec détail technique (ex: "614 règles chargées").

---

### A.3 ResizablePanels

**Props :**
```typescript
interface ResizablePanelsProps {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}
```

**Constraints :**
- Left : min 280px, max 420px, default 300px
- Center : min 400px, flex-1
- Right : min 280px, max 500px, default 360px

**Resize handle :** barre 4px `--mono-silver` hover → `--brand-violet`, curseur `col-resize`, drag listener sur `mousemove`.

**Implementation :** `useResizable` hook avec `useCallback` + `useRef` (pas de lib externe).

---

### A.4 VerdictTable

**Props :**
```typescript
interface VerdictTableProps {
  verdicts: Verdict[];
  onExport?: (format: 'csv' | 'pdf') => void;
  className?: string;
}
```

**Filter bar (48px) :** chips status PASS/FAIL/SKIP avec count badges + input search par règle `text-sm`. Chips style : `rounded-full px-3 py-1`, couleur selon status.

**Colonnes :** `Annexe | Règle | Type | Op | LHS | RHS | Écart | Status`

**Row states :**
- PASS : `--functional-pass` badge
- FAIL : `--functional-fail` badge, row background `rgba(255,59,48,0.04)`
- SKIP_* : `--functional-skip` badge `--mono-steel` text

**Expandable row :** click → zone sous la ligne avec détail `term_op`, `ax_origine`, `rubrique_code`, `literal_value` de chaque terme.

**Export :** bouton `Download` Lucide → CSV (native) ou PDF (mention "via chatbot-py" pour l'instant).

---

### A.5 ConformityGauge

**Props :**
```typescript
interface ConformityGaugeProps {
  passCount: number;
  failCount: number;
  skipCount: number;
  size?: number; // default 240
}
```

**Visual :** SVG arc 240° (de -210° à +30°), stroke-width 16px, `stroke-linecap: round`.

| Score | Couleur |
|---|---|
| ≥ 95% | `--brand-emerald` |
| 80–94% | `#FF9500` (amber) |
| < 80% | `--functional-fail` |

**Centre :** `%` en `text-3xl font-bold tabular-nums` couleur dynamique, label `text-sm --mono-steel` "Conformité".

**Animation :** `pathLength` de 0 → valeur cible sur 1 200ms `ease-out` (Framer Motion, dans la whitelist §14).

---

### A.6 CitationPill

**Props :**
```typescript
interface CitationPillProps {
  citationId: string;
  label: string; // ex: "Art. 15 Circ. 2021-03"
  kbContent?: string; // contenu kb_chunk
}
```

**Visual :** `rounded-full px-2 py-0.5 text-xs font-medium bg-[--brand-navy-bg] text-[--brand-navy] border border-[--brand-navy]/20 cursor-pointer`.

**Hover :** popover 360px `GlassCard regular` avec : titre citation, contenu `kb_chunk`, lien vers source si disponible. Icône `BookOpen` 12px.

---

### A.7 TypingIndicator

**Visual :** 3 dots `w-2 h-2 rounded-full bg-[--brand-violet]`, animation CSS `@keyframes bounce` avec délais `0ms/150ms/300ms`, boucle 1 200ms.

**Placement :** bubble gauche (Regalica), même style que `ChatBubble` Regalica, sans texte.

---

### A.8 SkeletonLoader

**Variants :**

```typescript
type SkeletonVariant = 'chat-bubble' | 'verdict-row' | 'gauge' | 'agent-step';
```

| Variant | Dimensions | Shimmer |
|---|---|---|
| `chat-bubble` | h-16 w-[60%] rounded-xl | gradient `--mono-pearl → --mono-silver` 1.5s |
| `verdict-row` | h-10 w-full | idem |
| `gauge` | circle 240px | radial gradient |
| `agent-step` | h-10 w-full | idem |

**Implémentation :** `animate-pulse` Tailwind + `bg-gradient-to-r from-[--mono-pearl] via-[--mono-silver] to-[--mono-pearl] bg-[length:200%_100%]`.

---

### A.9 Toast

**Props :**
```typescript
type ToastType = 'success' | 'error' | 'warning' | 'info';
interface ToastProps {
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; // ms, default 4000
}
```

**Placement :** `fixed top-4 right-4 z-50 flex flex-col gap-2`, max 3 simultanés.

| Type | Icône | Border-left |
|---|---|---|
| success | `CheckCircle2` | `--functional-pass` |
| error | `AlertCircle` | `--functional-fail` |
| warning | `AlertTriangle` | `#FF9500` |
| info | `Info` | `--brand-violet` |

**Matériau :** `GlassCard elevated` (backdrop-blur-24, bg `rgba(255,255,255,0.80)`).

**Animation :** slide-in depuis la droite 200ms, slide-out vers la droite 150ms.

**Ton Regalica :** messages en français, impersonnels, sans emoji. Ex: _"Validation terminée avec succès."_

---

### A.10 ChatBubble

**Props :**
```typescript
interface ChatBubbleProps {
  role: 'user' | 'regalica';
  content: string;
  metadata?: {
    citation?: string;
    confidence?: number;
    timestampUtc?: string;
    modelVersion?: string;
    agentStep?: string;
  };
}
```

**User bubble :** droite, `GlassCard regular`, max-width 75%, border-radius `rounded-2xl rounded-br-sm`.

**Regalica bubble :** gauche, `GlassCard thin`, max-width 80%, border-radius `rounded-2xl rounded-bl-sm`.

**Avatar Regalica :** 32px cercle `bg-[--brand-violet]`, initiales "RI" `text-white text-xs font-bold`, placé à gauche de la bubble.

**4 métadonnées (footer bubble Regalica) :**
```
[CitationPill "Art. 15 Circ."] · 97% · 2026-04-20T10:32Z · gemini-2.5-flash
```
`text-xs --mono-steel`, séparés par `·`.

**AgentStep badge :** si `agentStep`, badge `text-xs rounded-full px-2 bg-[--brand-violet-bg] text-[--brand-violet]` avant les métadonnées. Ex: `[RDG Evaluator]`

---

### A.11 GlassCard

**4 variants :**

| Variant | backdrop-blur | bg | border |
|---|---|---|---|
| `default` | blur-12 | `rgba(255,255,255,0.65)` | `rgba(255,255,255,0.40)` |
| `elevated` | blur-20 | `rgba(255,255,255,0.80)` | `rgba(255,255,255,0.60)` |
| `interactive` | blur-12 | `rgba(255,255,255,0.65)` | `rgba(255,255,255,0.40)` |
| `flat` | blur-0 | `rgba(249,249,251,1.00)` | `rgba(212,212,216,1.00)` |

**Interactive :** hover → `translateY(-2px)` + shadow upgrade, transition 200ms `ease-out`.

**Shadow :** `0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(255,255,255,0.40)`.

---

### A.12 AgentStatusBadge

**Props :** `{ agentId: string; label: string; state: AgentStep['state'] }`

**Visual :** `rounded-full text-xs px-2 py-0.5 font-medium`. Couleurs identiques à `AgentStepper` states.

**Usage :** inline dans `ChatBubble.metadata.agentStep`.

---

## Section B — Grammaire Conversationnelle Regalica (6 patterns)

### Règles universelles

- Langue : français par défaut, arabe si message utilisateur en arabe
- Ton : expert, direct, jamais marketing, jamais informel
- Chaque réponse : ≥ 1 citation BCT ou ADR interne
- Structure : constat → chiffres → action suggérée (jamais inversé)
- Interdit : "Je vais", "Je vais vous", "Bien sûr", "Excellente question"

---

### Pattern 1 — Accusé de réception upload

**Déclencheur :** `useEffect` sur `files.length > 0` avant `runAnalysis()`

**Template :**
```
{N} fichier(s) reçu(s) : {liste noms}.
Lancement de l'analyse structurelle (Circulaire BCT {ref}).
```

**Métadonnées :** `{ agentStep: 'Structure Validator', confidence: 1.0, timestampUtc: now }`

**Exemple :**
```
2 fichiers reçus : annexe_00.xml, annexe_630.xml.
Lancement de l'analyse structurelle (Circulaire BCT n°2021-03, §4.2).
```

---

### Pattern 2 — Rapport d'erreur structurelle

**Déclencheur :** `validateAPI` retourne `valid: false`

**Template :**
```
Analyse structurelle : {N} erreur(s) détectée(s) dans {fichier}.

Erreur {i} (Dimension {d}) — {chemin} :
{message}

Référence : {ref_reglementaire}.
Aucune évaluation RDG déclenchée tant que la structure n'est pas valide.
```

**Métadonnées :** `{ agentStep: 'Structure Validator', confidence: 1.0 }`

---

### Pattern 3 — Résumé d'évaluation RDG

**Déclencheur :** `evaluateAPI` retourne résultat complet

**Template :**
```
Évaluation RDG — Annexe {ax} ({N} règles applicables) :

  {pass_count} PASS  ·  {fail_count} FAIL  ·  {skip_count} IGNORÉ

{si fail_count > 0}
Écarts détectés ({fail_count}) :
{pour chaque FAIL : - Règle {num} : {lhs} {op} {rhs} · Écart : {gap}}

{si fail_count === 0}
Aucun écart détecté. Annexe {ax} conforme aux règles RDG en vigueur.

Référence : RDG BCT — Annexe {ax}, règles {min_rule}–{max_rule}.
```

**Métadonnées :** `{ agentStep: 'RDG Evaluator', confidence: 1.0 }`

---

### Pattern 4 — Demande d'annexes complémentaires

**Déclencheur :** `evaluateAPI` retourne `requiredAnnexes.length > 0`

**Template :**
```
Contrôles croisés en attente.

L'évaluation complète de l'annexe {ax} nécessite les données des annexes suivantes :
{pour chaque req : · Annexe {req} ({nb_règles_bloquées} règles en attente)}

Déposez ces fichiers pour lancer les vérifications inter-annexes
(Circulaire BCT n°2021-03, §6 — Cohérence inter-états).
```

**Métadonnées :** `{ agentStep: 'Regalica Report', confidence: 1.0 }`

---

### Pattern 5 — Deep dive sur une règle en échec

**Déclencheur :** clic sur une ligne FAIL dans `VerdictTable`

**Template :**
```
Analyse — Règle {num_regle}, Annexe {ax} :

  Opérateur attendu : {lhs} {op} {rhs}
  Valeur calculée   : {lhs}
  Écart             : {gap}

Interprétation :
{explication en 2-3 phrases basée sur les verdicts fournis — jamais de recalcul}

Suggestion de correction :
{suggestion concrète ciblant la rubrique en cause}

Référence : {citation_kb}.
```

**Métadonnées :** `{ agentStep: 'Pattern Analyst', confidence: ≥0.95 requis }`

**Règle stricte :** si confidence < 0.95, afficher : _"Niveau de confiance insuffisant pour une analyse détaillée de cette règle. Consultez la documentation BCT directement."_

---

### Pattern 6 — Confirmation signature / archivage

**Déclencheur :** workflow 4-yeux complété (Phase 5)

**Template :**
```
Rapport signé et archivé.

  Annexes validées : {liste}
  Date de clôture  : {date UTC}
  Signataires      : {sig1}, {sig2}
  Règles de référence : snapshot {rules_history_id}

Ce rapport est figé et reproductible (Pilier 6 — Immutable History).
Toute nouvelle soumission créera un rapport distinct.

Référence : ADR 0006 — Immutable History, Circulaire BCT n°2021-03.
```

---

## Section C — Flux d'interaction (3 scénarios)

### Scénario 1 — Premier upload, annexe unique sans dépendances

```
État initial : panneau gauche vide, centre "Déposez vos fichiers XML"

1. [User] Drop annexe_00.xml dans la drop zone
   → files: [annexe_00.xml]
   → Regalica (Pattern 1): "1 fichier reçu : annexe_00.xml..."
   → AgentStepper[0] = active (Structure Validator)
   → SkeletonLoader chat-bubble visible centre

2. [API /validate] → valid: true
   → AgentStepper[0] = done (1.2s badge)
   → AgentStepper[1] = active (RDG Evaluator)

3. [API /evaluate] → 614 règles, 585 PASS, 0 FAIL, requiredAnnexes: []
   → AgentStepper[1] = done (3.4s badge)
   → AgentStepper[2] = active (Pattern Analyst)
   → ConformityGauge: 95.3% (emerald), animation arc 1200ms

4. [Pattern Analyst] → aucun pattern anormal
   → AgentStepper[2] = done
   → AgentStepper[3] = active (Regalica Report)

5. [Regalica] → Pattern 3 (résumé) + Pattern 4 absent (requiredAnnexes vide)
   → AgentStepper[3] = done
   → VerdictTable peuplée, filtre default "FAIL" si > 0 sinon "ALL"
   → MissingAnnexeBanner: masquée
```

---

### Scénario 2 — Flux inter-annexes (annexe 630 nécessite annexe 00)

```
1. [User] Drop annexe_630.xml
   → (même étapes 1-3 que Scénario 1)
   → API /evaluate → 339 règles, requiredAnnexes: ['0']

2. [Regalica] → Pattern 3 (résumé partiel) PUIS Pattern 4 :
   "Contrôles croisés en attente. Annexe 00 requise (X règles bloquées)."
   → MissingAnnexeBanner: visible "Annexe requise : [00]"

3. [User] Drop annexe_00.xml dans la drop zone
   → useSessionStore.addFiles([annexe_00.xml])
   → accumulatedFiles = {annexe_630.xml, annexe_00.xml}
   → Regalica (Pattern 1 adapté): "Annexe 00 reçue. Lancement des contrôles croisés..."
   → runAnalysis() avec les 2 fichiers accumulés

4. [API /evaluate] avec 2 XMLs → 953 règles, requiredAnnexes: []
   → MissingAnnexeBanner: disparaît
   → ConformityGauge: mise à jour
   → Regalica: Pattern 3 complet (résumé des 2 annexes)
```

---

### Scénario 3 — Récupération après erreur structurelle

```
1. [User] Drop rapport_corrompu.xml
   → API /validate → valid: false, errors: [{dimension: 1, path: 'CodeAnnexe', message: '...'}]
   → AgentStepper[0] = error (badge "Erreur")
   → AgentStepper[1,2,3] = pending (bloqués)
   → Regalica: Pattern 2 (rapport d'erreur détaillé)
   → Toast error: "Validation structurelle échouée — 1 erreur"

2. [User] Ouvre XmlViewer → onglet Raw → localise l'erreur
   → Corrige le XML dans son éditeur externe
   → Drop rapport_corrige.xml (remplace rapport_corrompu.xml)

3. [useSessionStore] addFiles([rapport_corrige.xml]) → écrase l'ancienne entrée
   → runAnalysis() repart depuis l'étape 1
   → AgentStepper reset (tous pending)
   → Toast info: "Nouveau fichier détecté — analyse relancée"

4. → Scénario 1 standard
```

---

# Résumé Exécutif

| Phase | Durée | Impact Principal |
|---|---|---|
| 1 — Reliability | 2 sem | Gemini ne crash plus en prod, logs tracés |
| 2 — Context & Memory | 3 sem | Conversations longues stables, citations validées |
| 3 — Persistence & Realtime | 2 sem | Runs persistés, progress multi-onglet |
| 4 — Cross-Annexe | 3 sem | Accumulation XMLs, re-évaluation auto, Regalica orchestratrice |
| 5 — Enterprise Auth | 4 sem | SSO banques, audit 10 ans, 4-yeux signé |

**Total estimé : 14 semaines** (3.5 mois)

**Prochaine action requise :**
1. Validation humaine de ce plan
2. GO Phase 1 (Reliability) — peut démarrer sans Supabase provisionné
3. Provisionnement Supabase dev/staging pour Phase 3
4. ADR 0009 (pgmq) et ADR 0010 (Keycloak auth) avant Phase 5

---

*Document produit par Claude Sonnet 4.6 · sous-agents architect-rgflow + design-regalica · 2026-04-20*
