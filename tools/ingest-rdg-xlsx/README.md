# tools/ingest-rdg-xlsx

Parses `tests/fixtures/rdg.xlsx` (official BCT source) and emits
4 canonical JSON seed files into `apps/api/seeds/`:

- `referentials_annexes.json` — 52 BCT annexes
- `referentials_rubriques.json` — BCT rubriques (label=null, no XLSX source)
- `referentials_colonnes.json` — BCT colonnes (label=null, no XLSX source)
- `rules_structured.json` — 4 611 rules with full terms structure

## Usage (all args mandatory — zero defaults)

```bash
uv run python ingest.py \
  --xlsx-path <path-to-rdg.xlsx> \
  --output-dir <path-to-apps/api/seeds/>
```

## Doctrine

Zero invented values. Fields without official XLSX source = `null`.
Run once per new RDG.xlsx version. Output JSON files are committed
as canonical seeds — never regenerated automatically.

## Re-run

When BCT publishes a new RDG.xlsx:

1. Replace `tests/fixtures/rdg.xlsx`
2. Run `ingest.py`
3. Review diff on JSON files
4. Commit updated JSON files
5. Run 4-eyes validation on new/modified records
