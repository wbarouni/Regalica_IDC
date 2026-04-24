# verify-golden-integrity

Utilitaire Python qui vérifie l'intégrité du golden baseline du tenant pilote (58 XML, 9 batches) après import via `tools/golden-normalizer/`.

## Statut

**Squelette Phase 0.** La version canonique arrive en Phase 1 avec le schéma SQL qui précisera les manifestes et checksums attendus.

## Usage (Phase 1+)

```bash
uv run python tools/verify-golden-integrity/verify.py \
    --fixtures-dir tests/fixtures/golden
```

Ou via le script racine :

```bash
pnpm golden:verify
```

## Contrôles prévus

- Chaque batch attendu est présent sous `tests/fixtures/golden/tenant-001/`.
- Chaque XML a un SHA256 qui matche `manifest.json`.
- Chaque `expected_verdicts.json` est un JSON valide avec les totaux attendus.
- Aucun fichier parasite.

## Référence

- `docs/07-PLAN-GOLDEN-BASELINE-v2.md` — plan golden complet.
- `docs/PHASE-0-PLAN.md` §26 — critères de sortie Phase 0.
