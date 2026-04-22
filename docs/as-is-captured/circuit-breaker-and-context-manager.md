# REGFlow — Capture AS-IS

## Circuit breaker, retry exponentiel et context manager LLM

**Version :** 1.0
**Date :** avril 2026
**Type :** document de capture pré-suppression
**Origine :** `apps/web/src/lib/llm/` de l'ancien monorepo Regalica_IDC
**Statut :** référence pour la réimplémentation en Phase 2 (packages/evaluator si besoin) et Phase 3 (apps/api)
**Audience :** équipe qui portera la logique de résilience LLM dans le backend canonique

---

## Pourquoi ce document existe

Le dossier `apps/web/` (Next.js + Supabase) est supprimé en Phase 0. Il contient trois fichiers critiques de résilience des appels LLM Gemini qui doivent **absolument** être reportés dans le backend canonique en Phase 2-3 :

- `circuit-breaker.ts` — pattern circuit breaker en 3 états.
- `context-manager.ts` — fenêtre glissante de contexte conversationnel.
- `gemini-client.ts` — retry exponentiel et assemblage circuit-breaker + retry.

Ces trois logiques forment la chaîne de résilience complète pour les appels au LLM Gemini 2.5 Flash (agent principal, voir PRD §4 et §8). Sans elles, un transitoire réseau ou une panne Gemini casse l'UX Regalica. La réimplémentation Phase 2-3 doit conserver les **mêmes seuils numériques** et la **même sémantique** pour garantir la cohérence des SLO.

---

## Vue d'ensemble de la chaîne

```
Appel Regalica/Agent
  │
  ▼
┌──────────────────────────────────┐
│  geminiCircuitBreaker.call(      │  ← protection globale
│    fn = withRetry(...)           │
│  )                               │
└──────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────┐
│  withRetry(                      │  ← retry exponentiel 3 tentatives
│    fn = appel Gemini réel        │
│  )                               │
└──────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────┐
│  Gemini SDK — startChat +        │
│  sendMessage                     │
└──────────────────────────────────┘
```

**Ordre d'enveloppement critique.** Le circuit breaker enveloppe le retry, pas l'inverse. Cela signifie : si les 3 tentatives de retry échouent, une seule faille est comptée par le circuit breaker (pas 3). Le circuit ne s'ouvre que si l'échec persiste sur plusieurs appels consécutifs (par exemple 5 appels → 15 tentatives réseau). **Important à préserver** en Phase 3 pour éviter une ouverture prématurée du circuit lors d'un transitoire court.

Le context manager est orthogonal à cette chaîne : il prépare les messages envoyés, mais n'a aucune logique de résilience.

---

## 1. Circuit breaker

### États et transitions

Trois états :

- **CLOSED** — état nominal, tous les appels passent directement à la fonction encapsulée.
- **OPEN** — le circuit rejette immédiatement les appels avec l'erreur `"Circuit OPEN — service <name> temporairement indisponible"`.
- **HALF_OPEN** — état de convalescence : un appel est autorisé en trial. S'il réussit → CLOSED. S'il échoue → revient à OPEN.

Diagramme des transitions :

```
       threshold échecs consécutifs
CLOSED ───────────────────────────────► OPEN
  ▲                                       │
  │                          resetTimeoutMs écoulé
  │                                       │
  │                                       ▼
  │ succès en trial               HALF_OPEN
  └────────────────────────────────┘
       échec en trial retombe OPEN
```

### Paramètres par défaut

```typescript
new CircuitBreaker(
  name: string,
  failureThreshold = 5,
  resetTimeoutMs = 60_000,  // 60 secondes
)
```

**Instance utilisée pour Gemini :**

```typescript
const geminiCircuitBreaker = new CircuitBreaker('gemini', 5, 60_000);
```

- `failureThreshold = 5` — après 5 échecs consécutifs non récupérés, le circuit s'ouvre.
- `resetTimeoutMs = 60_000` — après 60 secondes en état OPEN, une tentative HALF_OPEN est autorisée au prochain appel.

### Algorithme

**Sur appel `call(fn)` :**

1. Si état = OPEN :
   - Si `Date.now() - lastFailureTime > resetTimeoutMs` → passer à HALF_OPEN et continuer vers l'étape 2.
   - Sinon lever `Error("Circuit OPEN — service <name> temporairement indisponible")` immédiatement.
2. Exécuter `fn()`.
3. Si succès → `onSuccess()` : état → CLOSED, `failureCount = 0`. Retourner le résultat.
4. Si échec (exception levée par `fn`) → `onFailure(err)` :
   - `failureCount++`.
   - `lastFailureTime = Date.now()`.
   - Si `failureCount >= failureThreshold` → état → OPEN, log niveau error.
   - Re-propager l'exception.

### Observabilité

Chaque transition et échec est loggué via le logger Pino du frontend (`@/lib/logger`) :

- `logger.info("Circuit half-open", { circuit: name })` — transition OPEN → HALF_OPEN.
- `logger.info("Circuit closed after recovery", { circuit: name })` — transition HALF_OPEN → CLOSED.
- `logger.warn("Circuit failure recorded", { circuit, failureCount, threshold, error })` — chaque échec.
- `logger.error("Circuit opened", { circuit, failureCount })` — ouverture du circuit.

En Phase 3, ces logs doivent être portés en logs structurés Pino côté backend `apps/api`, et en Phase 6 être également exposés en métriques Prometheus : compteurs par état, histogrammes de durée en OPEN, compteurs de transitions.

### Méthode d'introspection

```typescript
getState(): CBState;  // retourne CLOSED | OPEN | HALF_OPEN
```

Utile pour un endpoint `/health/circuits` en Phase 6.

### Points à préserver

1. **Seuil 5 échecs consécutifs** — calibré empiriquement sur Gemini, ne pas modifier sans raison métier.
2. **Reset 60 secondes** — compromis entre récupération rapide et évitement du hammering. Ne pas modifier sans justification.
3. **État partagé par instance** — un circuit breaker par service externe. Ne jamais partager une instance entre Gemini et Qwen, sinon un service défaillant impacte l'autre.
4. **Comptage séparé des échecs CB vs échecs retry** — le circuit breaker enveloppe le retry, donc un bloc `withRetry` qui échoue toutes ses tentatives compte pour **une** faille côté CB. C'est intentionnel.

---

## 2. Retry exponentiel

### Configuration par défaut

```typescript
const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1_000,     // 1 seconde
  maxDelayMs: 10_000,     // 10 secondes
  backoffFactor: 2,       // doublement à chaque échec
};
```

### Séquence de tentatives

Les délais calculés entre tentatives sont `min(baseDelayMs * backoffFactor^(attempt-1), maxDelayMs)` :

| Tentative | Action | Délai avant prochaine tentative |
|---|---|---|
| 1 | Appel Gemini | Si échec → 1 000 ms |
| 2 | Appel Gemini | Si échec → 2 000 ms |
| 3 | Appel Gemini | Si échec → abandon, exception levée |

**Total dans le pire cas (3 échecs consécutifs avec latence nulle) :** 3 appels + 3 s d'attente = ~3 s + latence Gemini × 3. Avec latence Gemini typique 2-4 s, une fenêtre d'attente utilisateur peut atteindre 15 s dans le pire cas.

### Algorithme `withRetry`

1. Pour `attempt` de 1 à `maxAttempts` :
   1. Tenter `fn()`.
   2. Si succès → retourner immédiatement.
   3. Si échec :
      - Si `attempt < maxAttempts` :
        - Calculer le délai exponentiel.
        - Logger `logger.warn("Gemini call failed, retrying", { correlationId, attempt, nextDelayMs, error })`.
        - `await sleep(delay)`.
      - Sinon (dernier échec) : sortir de la boucle.
2. Logger `logger.error("Gemini call exhausted retries", { correlationId, maxAttempts, error })`.
3. Lever `lastError`.

### Propagation du `correlationId`

Chaque appel `withRetry` reçoit optionnellement un `correlationId: string` qui est propagé dans tous les logs. C'est **essentiel** pour le tracing distribué (voir PRD §9 Phase 6 observabilité). La Phase 3 doit étendre cela à un contexte OpenTelemetry complet (spans par tentative).

### Points à préserver

1. **3 tentatives max** — calibré pour rester sous les 15 s de latence utilisateur perceptible. Ne pas augmenter sans revue UX.
2. **Backoff exponentiel x2** — standard industrie, évite la synchronisation des retries sur panne partielle.
3. **Plafond 10 s** — protection contre les délais exponentiels qui s'emballent (théoriquement à `maxAttempts=10` on aurait 512 s).
4. **Retry sur **toute** exception** — l'AS-IS ne discrimine pas les types d'erreurs. Un 400 Bad Request est retryé au même titre qu'un 503. **Bug mineur à corriger en Phase 3 :** ne pas retry les erreurs permanentes (4xx sauf 408, 429). Retry uniquement 5xx, 408, 429, timeouts et erreurs réseau. Utiliser le status code ou un flag `isRetryable` sur l'erreur.
5. **Pas de jitter** — l'AS-IS utilise un délai déterministe. **Amélioration Phase 3 :** ajouter un jitter aléatoire (±20 %) pour éviter la synchronisation de retries entre agents parallèles.

---

## 3. Assemblage circuit breaker + retry — `sendGeminiMessage`

La fonction `sendGeminiMessage` combine les deux couches de résilience pour produire l'interface de haut niveau utilisée par les agents Regalica et les spécialistes LLM.

### Signature

```typescript
export async function sendGeminiMessage(params: {
  modelId: string;
  systemInstruction: string;
  history: GeminiChatMessage[];
  message: string;
  correlationId?: string;
}): Promise<GeminiChatResponse>;

interface GeminiChatResponse {
  text: string;
  modelId: string;
}
```

### Algorithme

```typescript
return geminiCircuitBreaker.call(() =>
  withRetry(async () => {
    const chat = model.startChat(chatParams);
    const result = await chat.sendMessage(params.message);
    return { text: result.response.text(), modelId: params.modelId };
  }, DEFAULT_RETRY, params.correlationId)
);
```

**Ordre.** Circuit breaker EXTÉRIEUR → retry INTÉRIEUR → appel Gemini. Confirmé supra en §"Ordre d'enveloppement critique".

### Log de succès

Après succès, log info avec `responseLength` :

```typescript
logger.info("Gemini response received", {
  correlationId,
  model: modelId,
  responseLength: text.length,
});
```

En Phase 6, compléter par une métrique Prometheus `llm_response_bytes` histogram.

### Points à préserver

1. **`systemInstruction` reçu en paramètre**, pas codé en dur. Cohérent avec le principe zéro-hardcoding : les prompts système viennent de `prompt_bank` en base.
2. **`history` reçu en paramètre**, passé tel quel à `startChat({ history })`. Le context manager (section suivante) est responsable de sa préparation en amont.
3. **Clé API lue depuis `process.env.GEMINI_API_KEY`** — lecture à chaque appel. **Amélioration Phase 3 :** encapsuler dans un module config validé par Zod au démarrage, avec l'instance `GoogleGenerativeAI` partagée pour éviter la recréation à chaque appel (potentielle source de latence et de surcharge).

---

## 4. Context manager — fenêtre glissante

### Type et constante

```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_WINDOW = 8;
```

**Taille de fenêtre = 8 messages.** Ce chiffre est un compromis entre :
- Rétention de contexte suffisante pour une conversation T2 riche (Regalica + utilisateur).
- Économie de tokens envoyés à Gemini (coût × latence).
- Conformité à l'exigence Gemini que la conversation commence par un `user`.

### Fonction `trimContext`

**Signature.**
```typescript
function trimContext(messages: ChatMessage[]): ChatMessage[];
```

**Algorithme.**

1. Si `messages.length <= 8` → retourner tel quel.
2. Sinon prendre les **8 derniers** messages.
3. Dans cette fenêtre de 8, trouver l'index du premier message `role === 'user'`.
4. Si trouvé → retourner la tranche à partir de cet index (donc 1 à 8 messages, avec en-tête garanti `user`).
5. Si pas trouvé (les 8 derniers sont tous `assistant`, cas théorique peu probable) → retourner la fenêtre brute. **Comportement limite** : Gemini rejettera probablement ce payload. À durcir en Phase 3 (ex. forcer l'ajout d'un message `user` synthétique ou lever une exception explicite).

### Fonction `toGeminiHistory`

**Signature.**
```typescript
function toGeminiHistory(
  messages: ChatMessage[],
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
```

**Rôle.** Convertir le format interne `{ role: 'user'|'assistant', content }` vers le format attendu par l'SDK Gemini `{ role: 'user'|'model', parts: [{ text }] }`.

**Transformation.**
- `'assistant'` → `'model'` (vocabulaire Gemini).
- `content` string → `parts: [{ text: content }]`.

**Note importante.** Le commentaire dans le code AS-IS dit : *"Strips the last message (which is sent separately via sendMessage)"* — mais le code **ne strip pas** ce dernier message. C'est un écart entre intention et implémentation. **À clarifier en Phase 3 :** soit la fonction strip réellement le dernier message (comportement cohérent avec `sendMessage(text)` qui ajoute le message courant), soit le commentaire est supprimé. Probablement la première option est la bonne : l'appelant doit passer `history = messages.slice(0, -1)` ou `toGeminiHistory` doit faire `.slice(0, -1)` en interne.

### Points à préserver

1. **Taille de fenêtre 8** — calibrée pour Regalica, à ne pas modifier sans test UX.
2. **Garantie d'en-tête `user`** — exigence dure de l'API Gemini.
3. **Conversion de rôle `assistant` → `model`** — mapping entre vocabulaire interne (neutre) et vocabulaire Gemini. Si on ajoute Qwen (Phase 6) en fallback, le mapping peut différer (Qwen utilise souvent `assistant`) — prévoir une couche d'abstraction.
4. **Absence de résumé des messages tronqués** — le contexte hors fenêtre est perdu sans synthèse. **Amélioration Phase 4 envisageable :** générer un résumé des messages 1..N-8 via un petit appel LLM et l'injecter comme système au début de la fenêtre. Non prioritaire mais documenté pour mémoire.

---

## Synthèse des seuils numériques à préserver

| Paramètre | Valeur AS-IS | Justification |
|---|---|---|
| Circuit breaker `failureThreshold` | 5 | Empirique, tolérance aux transitoires |
| Circuit breaker `resetTimeoutMs` | 60 000 ms | Compromis récupération / hammering |
| Retry `maxAttempts` | 3 | Sous 15 s latence perçue max |
| Retry `baseDelayMs` | 1 000 ms | Premier retry rapide |
| Retry `maxDelayMs` | 10 000 ms | Plafond de sécurité |
| Retry `backoffFactor` | 2 | Standard industrie |
| Context `MAX_WINDOW` | 8 messages | Compromis contexte / tokens |

En Phase 3, ces valeurs doivent être **configurables via variables d'environnement** (pas codées en dur) pour permettre l'ajustement par tenant ou par environnement (dev vs prod) sans redéploiement.

---

## Où réimplémenter en Phase 2-3

**Phase 2 — `packages/evaluator` :** pas de besoin direct. Le moteur d'évaluation est purement déterministe et n'appelle pas de LLM.

**Phase 3 — `apps/api` (backend Node.js) :** dossier recommandé `apps/api/src/infra/llm/` avec trois fichiers :

- `circuit-breaker.ts` — classe `CircuitBreaker` portée telle quelle.
- `retry.ts` — fonction `withRetry` (renommée depuis `gemini-client.ts` pour la réutiliser pour Qwen aussi).
- `gemini-client.ts` — `sendGeminiMessage` + configuration.
- `context-manager.ts` — `trimContext` et `toGeminiHistory`.

**Phase 4 — `apps/chatbot-py` (services Python) :** si les agents Python appellent aussi Gemini directement, réimplémenter la même logique en Python :
- `tenacity` pour le retry exponentiel (équivalent `withRetry`).
- `pybreaker` ou implémentation maison pour le circuit breaker.
- Même seuils numériques.

**Phase 6 — observabilité :** exposer les états circuit et compteurs retry en métriques Prometheus, dashboards Grafana dédiés.

---

## Points d'amélioration identifiés (à traiter en Phase 3 ou 6)

1. **Retry sur erreurs non-retryables** — actuellement retry sur 4xx permanents. À filtrer par status code / classe d'erreur.
2. **Jitter absent** — ajouter ±20 % aléatoire au délai.
3. **Instance Gemini recréée à chaque appel** — singleton à initialiser au boot.
4. **Seuils codés en dur** — à rendre configurables par env.
5. **Pas de métriques Prometheus** — à ajouter en Phase 6.
6. **`toGeminiHistory` ne strip pas le dernier message** — clarifier le contrat.
7. **`trimContext` peut retourner 8 `assistant`** — lever une exception explicite ou forcer l'ajout d'un user synthétique.
8. **Tracing OpenTelemetry manquant** — un span par tentative pour le debug distribué.

---

## Pointeur vers le code original

```bash
git show pre-refactoring-backup-2026-04-22:apps/web/src/lib/llm/circuit-breaker.ts
git show pre-refactoring-backup-2026-04-22:apps/web/src/lib/llm/context-manager.ts
git show pre-refactoring-backup-2026-04-22:apps/web/src/lib/llm/gemini-client.ts
```

Fichiers à **lire pour compréhension**, jamais à copier dans le nouveau monorepo. La réimplémentation Phase 3 doit reproduire la sémantique en respectant les seuils numériques listés dans la synthèse supra.

---

*Fin du document de capture AS-IS — circuit breaker, retry exponentiel et context manager*
