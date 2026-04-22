# ADR 0002 — Stratégie LLM : Gemini en MVP, Ollama (Qwen 2.5 3B) en cible

- **Status:** Accepted
- **Date:** 2026-04-18

## Context

Le pilier 3 (ZERO HALLUCINATION) impose des garde-fous systémiques sur tout
appel LLM (citations vérifiables, seuil confiance ≥ 0.95 sur topic critique,
red team en CI).

Trois options pour l'implémentation :

1. **Claude API** (prévu par le master doc v1.1) — qualité SOTA, prompt caching
   mature, mais coût par token et dépendance à un fournisseur US.
2. **Gemini 2.5 Flash** — API managée Google, quotas généreux, bonne qualité
   sur FR + traitement bancaire, proche en coût.
3. **Ollama self-hosted (Qwen 2.5 3B)** — souveraineté totale, coût = compute
   amorti, latence sous contrôle, mais infra à gérer (Cloud Run GPU).

Le CEO a déjà une intégration Gemini fonctionnelle (ancien stack v1). L'équipe
ML est à l'aise avec Qwen 2.5.

## Decision

**Deux étapes.**

### Étape 1 — MVP (Phase 1-4) : Gemini
- Provider : `google-generativeai` Python SDK
- Modèle par défaut : `gemini-2.5-flash` (rapide, 128k contexte)
- Modèle premium pour extraction règles PDF : `gemini-2.5-pro`
- Clé `GEMINI_API_KEY` dans `.env` (jamais committée)

### Étape 2 — GA (Phase 6) : Ollama sur Cloud Run GPU
- Modèle cible : `qwen2.5:3b` (3 milliards de paramètres, 128k contexte)
- Embeddings : migration de `text-embedding-004` (Gemini) vers
  `nomic-embed-text` (Ollama)
- Infra : Cloud Run GCP avec T4/L4 GPU

### Abstraction commune dès jour 1
Toute logique métier utilise **`app.llm.base.LLMClient`** (Protocol Python) :

```python
class LLMClient(Protocol):
    async def generate(
        self, system: str, user: str, *,
        json_schema: dict | None = None, max_tokens: int = 2000
    ) -> LLMResponse: ...
```

Le provider concret est instancié au boot selon `LLM_PROVIDER={gemini|ollama}`.
**Aucun `if provider == ...` dans le code applicatif.**

## Consequences

### Positives
- Zéro lock-in : switch Gemini → Ollama = changement d'une variable d'env.
- MVP rapide : Gemini dispo en 1h (clé + SDK).
- Budget contrôlé : Gemini paie-au-token, Ollama CAPEX amorti.
- Souveraineté à terme : Ollama run dans GCP EU region (ou IAT + Tunisie).

### Négatives
- Double implémentation + double test (GeminiClient + OllamaClient).
- Qwen 2.5 3B est moins capable que Gemini 2.5 Flash sur raisonnement complexe
  — prévoir un mécanisme d'escalation (Gemini en fallback si confiance < 0.95).
- Migration RAG embeddings nécessite ré-indexation complète du KB.

## Guardrails communs (valables pour tout provider)

1. **Validation citations** : toute `LLMResponse.citations` doit pointer vers
   un `kb_chunks.id` existant. Sinon → ERROR logged + réponse rejetée.
2. **Seuil confiance** : `confidence < 0.95` sur topics critiques (nouvelle
   règle RDG proposée, verdict FAIL explication) → renvoyé à un humain.
3. **Red team en CI** : jeu de prompts adversariaux (injection, jailbreak,
   hallucination numérique) testé à chaque PR touchant `apps/chatbot-py/`.
4. **LLM ne calcule JAMAIS** (pilier 3 literal) : tout chiffre dans une réponse
   vient d'une query DB ou d'un Decimal.js calcul côté api, jamais du modèle.

## Related ADRs
- ADR 0001 — divergence stack vs master doc (Claude → Gemini/Ollama)
