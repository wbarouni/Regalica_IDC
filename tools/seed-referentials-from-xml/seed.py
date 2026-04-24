"""REGFlow — Seed référentiels depuis XML golden.

Parse exhaustivement les XML du corpus golden pour extraire les rubriques,
colonnes, et types de structure XML par annexe. Génère les migrations SQL
qui alimentent les tables du Document 6:

- referentials_rubriques : (code_annexe, code_rubrique, level, parent_code)
- referentials_colonnes  : (code_annexe, numero_colonne)
- referentials_xml_structures : (code_annexe, xml_structure_type_1_to_10, has_sentinel_d)

Usage:
    uv run python seed.py \\
        --fixtures-dir ../../tests/fixtures/golden \\
        --output-dir ../../apps/api/src/db/migrations \\
        --start-migration-number 9 \\
        --author "ALGORIA Factory"
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class RubriqueRecord:
    """One rubrique as observed in one or more XMLs."""

    code_annexe: str
    code_rubrique: str
    first_seen_in: str
    total_occurrences: int = 0
    hierarchy_level: int = 0
    parent_code: str | None = None

    def natural_key(self) -> tuple[str, str]:
        return (self.code_annexe, self.code_rubrique)


@dataclass
class ColonneRecord:
    """One column number as observed for an annexe."""

    code_annexe: str
    numero_colonne: str
    first_seen_in: str
    total_occurrences: int = 0

    def natural_key(self) -> tuple[str, str]:
        return (self.code_annexe, self.numero_colonne)


@dataclass
class XmlStructureRecord:
    """Structural characterization of one annexe across all its XMLs."""

    code_annexe: str
    nomenclature: str  # modern | legacy | specialized
    xml_structure_type: int  # 1 to 10 per CC-tech part II
    has_societe_tag: bool = False
    has_membre_tag: bool = False
    has_instrument_tag: bool = False
    has_sentinel_d: bool = False
    observed_rubrique_prefixes: set[str] = field(default_factory=set)
    sample_file: str = ""


# ---------------------------------------------------------------------------
# XML parsing
# ---------------------------------------------------------------------------


def iter_golden_xmls(fixtures_root: Path) -> list[Path]:
    """Return all XML files under fixtures/golden/ recursively."""
    if not fixtures_root.exists():
        raise SystemExit(f"Fixtures directory not found: {fixtures_root}")
    return sorted(
        list(fixtures_root.rglob("*.xml")) + list(fixtures_root.rglob("*.XML"))
    )


def extract_annexe_code(content: str) -> str | None:
    """Extract the CodeAnnexe (or CODE_ANNEXE) value."""
    m = re.search(r"<CodeAnnexe>([^<]+)</CodeAnnexe>", content)
    if m and m.group(1).strip():
        return m.group(1).strip()
    m = re.search(r"<CODE_ANNEXE>([^<]+)</CODE_ANNEXE>", content)
    if m and m.group(1).strip():
        return m.group(1).strip()
    return None


def extract_rubriques(content: str) -> list[str]:
    """Extract all <Rubrique id="X"> codes in order of appearance."""
    return re.findall(r'<Rubrique id="([^"]+)"', content)


def extract_colonnes(content: str) -> list[str]:
    """Extract all <Colonne id="N"> numbers (deduplicated per annexe)."""
    return list(dict.fromkeys(re.findall(r'<Colonne id="([^"]+)"', content)))


def detect_nomenclature(content: str) -> str:
    """Identify XML nomenclature."""
    if "<ENTETE>" in content:
        return "legacy"
    if "<Entete>" in content:
        if "<TauxCrediteurs>" in content or "<TauxDebiteurs>" in content:
            return "specialized"
        return "modern"
    if "<TauxCrediteurs>" in content or "<TauxDebiteurs>" in content:
        return "specialized"
    return "unknown"


def detect_xml_structure_type(content: str, rubriques: list[str]) -> int:
    """Classify the XML into one of 10 structural types per CC-tech partie II.

    Heuristic rules:
      Type 1: Tabular moderne standard (rubrique + colonne sans détail)
      Type 2: Tabular with <Societe> relational details (annexes 100, 110)
      Type 3: Tabular with <Devise> currency details
      Type 4: Tabular with <Instrument> by instrument (138, 139)
      Type 5: Tabular with <Membre> gouvernance (210, 220)
      Type 6: Tabular with multiple relational sublevels (132)
      Type 7: Tabular with D1-D6 sentinels (130-142)
      Type 8: Legacy ENTETE with <RECAP_POS>/<DET_PSC> (810 position change)
      Type 9: Specialized tax rates (781)
      Type 10: Other / hybrid
    """
    if "<RECAP_POS>" in content or "<DET_PSC>" in content:
        return 8
    if "<TauxCrediteurs>" in content or "<TauxDebiteurs>" in content:
        return 9

    has_societe = "<Societe>" in content
    has_devise = "<Devise>" in content or "<CODE_DEV>" in content
    has_instrument = "<Instrument>" in content
    has_membre = "<Membre>" in content

    # Detect D-sentinels in rubrique codes (pattern rubriques with details iteration)
    has_d_sentinel = any(r.startswith("13006") for r in rubriques) or has_societe

    if has_societe and has_devise:
        return 6
    if has_societe:
        return 2
    if has_devise:
        return 3
    if has_instrument:
        return 4
    if has_membre:
        return 5
    if has_d_sentinel:
        return 7
    return 1


def detect_sentinel_d(content: str, rubriques: list[str]) -> bool:
    """Check for D1-D6 sentinel iteration patterns."""
    return (
        "<Societe>" in content
        or "<Membre>" in content
        or "<Instrument>" in content
        or any(r.startswith("13006") for r in rubriques)
    )


# ---------------------------------------------------------------------------
# Hierarchy inference for rubrique codes
# ---------------------------------------------------------------------------


def infer_rubrique_hierarchy(code: str) -> tuple[int, str | None]:
    """Infer (level, parent_code) from rubrique code structure.

    Convention BCT: rubrique codes are 14-char strings where trailing zeros
    mark level aggregation. Examples:
      PA010000000000 = top level
      PA010100000000 = level 1 child
      PA010101000000 = level 2 child
      PA010101010000 = level 3 child

    Heuristic: the deeper the non-zero suffix, the deeper the level.
    """
    if len(code) < 4:
        return (0, None)

    # Find the position of the last non-zero pair (2 chars per level)
    # Starting from position 2 (skipping 2-char prefix like PA, AC, etc.)
    levels = 0
    for i in range(2, min(len(code), 14), 2):
        pair = code[i:i + 2]
        if pair == "00":
            break
        levels += 1

    # Compute parent: replace last non-zero pair by "00"
    if levels <= 1:
        return (levels, None)

    # Parent is code with last pair set to zero
    parent_end = 2 + (levels - 1) * 2
    parent = code[:parent_end] + "00" + code[parent_end + 2:]
    return (levels, parent)


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


def aggregate_referentials(
    xml_files: list[Path],
) -> tuple[
    dict[tuple[str, str], RubriqueRecord],
    dict[tuple[str, str], ColonneRecord],
    dict[str, XmlStructureRecord],
]:
    """Aggregate rubrique, colonne, and xml_structure records from all XMLs."""
    rubriques: dict[tuple[str, str], RubriqueRecord] = {}
    colonnes: dict[tuple[str, str], ColonneRecord] = {}
    structures: dict[str, XmlStructureRecord] = {}

    for xml_path in xml_files:
        content = xml_path.read_bytes().decode("utf-8", errors="ignore")
        ann = extract_annexe_code(content)
        if not ann:
            continue

        nomenclature = detect_nomenclature(content)
        found_rubriques = extract_rubriques(content)
        found_colonnes = extract_colonnes(content)

        xml_type = detect_xml_structure_type(content, found_rubriques)
        has_d = detect_sentinel_d(content, found_rubriques)

        # Update structure record for this annexe
        if ann not in structures:
            structures[ann] = XmlStructureRecord(
                code_annexe=ann,
                nomenclature=nomenclature,
                xml_structure_type=xml_type,
                has_societe_tag="<Societe>" in content,
                has_membre_tag="<Membre>" in content,
                has_instrument_tag="<Instrument>" in content,
                has_sentinel_d=has_d,
                sample_file=xml_path.name,
            )
        # Prefixes for debug
        for r in found_rubriques:
            structures[ann].observed_rubrique_prefixes.add(r[:4])

        # Record rubriques
        for code in found_rubriques:
            key = (ann, code)
            if key not in rubriques:
                level, parent = infer_rubrique_hierarchy(code)
                rubriques[key] = RubriqueRecord(
                    code_annexe=ann,
                    code_rubrique=code,
                    first_seen_in=xml_path.name,
                    hierarchy_level=level,
                    parent_code=parent,
                )
            rubriques[key].total_occurrences += 1

        # Record colonnes
        for num in found_colonnes:
            key_c = (ann, num)
            if key_c not in colonnes:
                colonnes[key_c] = ColonneRecord(
                    code_annexe=ann,
                    numero_colonne=num,
                    first_seen_in=xml_path.name,
                )
            colonnes[key_c].total_occurrences += 1

    return rubriques, colonnes, structures


# ---------------------------------------------------------------------------
# SQL migration generation
# ---------------------------------------------------------------------------


SQL_HEADER = """-- REGFlow — Migration de seeding des référentiels BCT depuis le golden corpus
-- Générée automatiquement par tools/seed-referentials-from-xml/seed.py
-- Date de génération: {generated_at}
-- Source: {source_count} XML du golden baseline (tenant pilote anonymisé)
-- Auteur technique: {author}
--
-- IMPORTANT:
-- Ces référentiels capturent la structure observée dans le corpus. Les
-- libellés métier (libelle_fr, libelle_ar, description) sont laissés à NULL
-- et doivent être enrichis manuellement par un expert réglementaire dans un
-- second temps via la procédure 4-yeux (voir Document 8 §15).
--
-- La colonne valid_from est fixée à '2024-01-01' (date d'entrée en vigueur
-- supposée des règles RDG actuelles). La colonne valid_to est NULL (version
-- active courante).

BEGIN;

"""

SQL_FOOTER = """
COMMIT;
"""


def emit_rubriques_sql(
    records: dict[tuple[str, str], RubriqueRecord],
    migration_number: int,
    author: str,
    source_count: int,
) -> str:
    """Generate INSERT statements for referentials_rubriques table."""
    lines = [
        SQL_HEADER.format(
            generated_at=datetime.now(timezone.utc).isoformat(),
            source_count=source_count,
            author=author,
        ),
        f"-- Migration {migration_number:03d}: seed referentials_rubriques",
        f"-- Total records: {len(records)}",
        "",
        "-- Cleanup any previous seeding for idempotency",
        "DELETE FROM referentials_rubriques WHERE valid_from = '2024-01-01' AND valid_to IS NULL;",
        "",
        "INSERT INTO referentials_rubriques (",
        "  id, tenant_id, code_annexe, code_rubrique, hierarchy_level, parent_code_rubrique,",
        "  libelle_fr, libelle_ar, description,",
        "  valid_from, valid_to, status,",
        "  created_at, created_by_user_id",
        ") VALUES",
    ]

    values_sql = []
    # Sort deterministically by (annexe, rubrique code)
    sorted_records = sorted(records.values(), key=lambda r: (r.code_annexe, r.code_rubrique))
    for rec in sorted_records:
        parent_sql = f"'{rec.parent_code}'" if rec.parent_code else "NULL"
        values_sql.append(
            f"  (uuidv7(), NULL, '{rec.code_annexe}', '{rec.code_rubrique}', "
            f"{rec.hierarchy_level}, {parent_sql}, "
            f"NULL, NULL, NULL, "
            f"'2024-01-01', NULL, 'active', "
            f"NOW(), NULL)"
        )

    lines.append(",\n".join(values_sql) + ";")
    lines.append("")
    lines.append(SQL_FOOTER)
    return "\n".join(lines)


def emit_colonnes_sql(
    records: dict[tuple[str, str], ColonneRecord],
    migration_number: int,
    author: str,
    source_count: int,
) -> str:
    """Generate INSERT statements for referentials_colonnes table."""
    lines = [
        SQL_HEADER.format(
            generated_at=datetime.now(timezone.utc).isoformat(),
            source_count=source_count,
            author=author,
        ),
        f"-- Migration {migration_number:03d}: seed referentials_colonnes",
        f"-- Total records: {len(records)}",
        "",
        "DELETE FROM referentials_colonnes WHERE valid_from = '2024-01-01' AND valid_to IS NULL;",
        "",
        "INSERT INTO referentials_colonnes (",
        "  id, tenant_id, code_annexe, numero_colonne,",
        "  libelle_fr, libelle_ar, description,",
        "  valid_from, valid_to, status,",
        "  created_at, created_by_user_id",
        ") VALUES",
    ]

    values_sql = []
    sorted_records = sorted(
        records.values(),
        key=lambda r: (r.code_annexe, int(r.numero_colonne) if r.numero_colonne.isdigit() else 0),
    )
    for rec in sorted_records:
        values_sql.append(
            f"  (uuidv7(), NULL, '{rec.code_annexe}', '{rec.numero_colonne}', "
            f"NULL, NULL, NULL, "
            f"'2024-01-01', NULL, 'active', "
            f"NOW(), NULL)"
        )

    lines.append(",\n".join(values_sql) + ";")
    lines.append("")
    lines.append(SQL_FOOTER)
    return "\n".join(lines)


def emit_structures_sql(
    records: dict[str, XmlStructureRecord],
    migration_number: int,
    author: str,
    source_count: int,
) -> str:
    """Generate INSERT statements for referentials_xml_structures table."""
    lines = [
        SQL_HEADER.format(
            generated_at=datetime.now(timezone.utc).isoformat(),
            source_count=source_count,
            author=author,
        ),
        f"-- Migration {migration_number:03d}: seed referentials_xml_structures",
        f"-- Total records: {len(records)} (one per annexe)",
        "",
        "DELETE FROM referentials_xml_structures WHERE valid_from = '2024-01-01' AND valid_to IS NULL;",
        "",
        "INSERT INTO referentials_xml_structures (",
        "  id, tenant_id, code_annexe, nomenclature,",
        "  xml_structure_type, has_societe_tag, has_membre_tag, has_instrument_tag,",
        "  has_sentinel_d, sample_file_reference,",
        "  valid_from, valid_to, status,",
        "  created_at, created_by_user_id",
        ") VALUES",
    ]

    values_sql = []
    sorted_records = sorted(records.values(), key=lambda r: r.code_annexe)
    for rec in sorted_records:
        values_sql.append(
            f"  (uuidv7(), NULL, '{rec.code_annexe}', '{rec.nomenclature}', "
            f"{rec.xml_structure_type}, "
            f"{'TRUE' if rec.has_societe_tag else 'FALSE'}, "
            f"{'TRUE' if rec.has_membre_tag else 'FALSE'}, "
            f"{'TRUE' if rec.has_instrument_tag else 'FALSE'}, "
            f"{'TRUE' if rec.has_sentinel_d else 'FALSE'}, "
            f"'{rec.sample_file}', "
            f"'2024-01-01', NULL, 'active', "
            f"NOW(), NULL)"
        )

    lines.append(",\n".join(values_sql) + ";")
    lines.append("")
    lines.append(SQL_FOOTER)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def build_report(
    rubriques: dict[tuple[str, str], RubriqueRecord],
    colonnes: dict[tuple[str, str], ColonneRecord],
    structures: dict[str, XmlStructureRecord],
    xml_count: int,
) -> dict[str, Any]:
    """Build a JSON summary of what was extracted."""
    by_annexe_rubriques: dict[str, int] = defaultdict(int)
    for key in rubriques.keys():
        by_annexe_rubriques[key[0]] += 1

    by_annexe_colonnes: dict[str, int] = defaultdict(int)
    for key in colonnes.keys():
        by_annexe_colonnes[key[0]] += 1

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_xml_count": xml_count,
        "totals": {
            "rubriques": len(rubriques),
            "colonnes": len(colonnes),
            "xml_structures": len(structures),
            "annexes_covered": len(structures),
        },
        "annexes_detail": [
            {
                "code_annexe": ann,
                "nomenclature": s.nomenclature,
                "xml_structure_type": s.xml_structure_type,
                "has_sentinel_d": s.has_sentinel_d,
                "rubriques_count": by_annexe_rubriques.get(ann, 0),
                "colonnes_count": by_annexe_colonnes.get(ann, 0),
                "sample_file": s.sample_file,
            }
            for ann, s in sorted(structures.items(), key=lambda x: (len(x[0]), x[0]))
        ],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(
    fixtures_dir: Path,
    output_dir: Path,
    start_migration_number: int,
    author: str,
    dry_run: bool,
) -> dict[str, Any]:
    xml_files = iter_golden_xmls(fixtures_dir)
    if not xml_files:
        raise SystemExit(f"No XML files under {fixtures_dir}")

    rubriques, colonnes, structures = aggregate_referentials(xml_files)

    if not dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)

        rubriques_file = output_dir / f"{start_migration_number:03d}_seed_referentials_rubriques.sql"
        colonnes_file = output_dir / f"{start_migration_number + 1:03d}_seed_referentials_colonnes.sql"
        structures_file = output_dir / f"{start_migration_number + 2:03d}_seed_referentials_xml_structures.sql"

        rubriques_file.write_text(
            emit_rubriques_sql(rubriques, start_migration_number, author, len(xml_files)),
            encoding="utf-8",
        )
        colonnes_file.write_text(
            emit_colonnes_sql(colonnes, start_migration_number + 1, author, len(xml_files)),
            encoding="utf-8",
        )
        structures_file.write_text(
            emit_structures_sql(structures, start_migration_number + 2, author, len(xml_files)),
            encoding="utf-8",
        )

    return build_report(rubriques, colonnes, structures, len(xml_files))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="REGFlow seed-referentials-from-xml — generate SQL migrations from golden XMLs"
    )
    parser.add_argument("--fixtures-dir", type=Path, required=True,
                        help="Path to tests/fixtures/golden/")
    parser.add_argument("--output-dir", type=Path, required=True,
                        help="Directory where migration SQL files will be written")
    parser.add_argument("--start-migration-number", type=int, default=9,
                        help="First migration number to use (default: 9)")
    parser.add_argument("--author", type=str, default="ALGORIA Factory",
                        help="Author attribution in SQL file header")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and report without writing SQL files")
    args = parser.parse_args()

    report = run(
        fixtures_dir=args.fixtures_dir,
        output_dir=args.output_dir,
        start_migration_number=args.start_migration_number,
        author=args.author,
        dry_run=args.dry_run,
    )

    t = report["totals"]
    print(f"✓ Seed generation complete")
    print(f"  Source XMLs: {report['source_xml_count']}")
    print(f"  Annexes covered: {t['annexes_covered']}")
    print(f"  Rubriques extracted: {t['rubriques']}")
    print(f"  Colonnes extracted: {t['colonnes']}")
    print(f"  XML structures: {t['xml_structures']}")
    print()
    print("  Per annexe detail:")
    for entry in report["annexes_detail"]:
        print(
            f"    {entry['code_annexe']:>5}  "
            f"[{entry['nomenclature']:<11s}] "
            f"type={entry['xml_structure_type']} "
            f"{'D-sentinel' if entry['has_sentinel_d'] else '          '} "
            f"rubs={entry['rubriques_count']:>3} "
            f"cols={entry['colonnes_count']:>3}"
        )


if __name__ == "__main__":
    main()
