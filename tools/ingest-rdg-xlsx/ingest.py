#!/usr/bin/env python3
"""tools/ingest-rdg-xlsx/ingest.py.

Parse tests/fixtures/rdg.xlsx (official BCT source) and emit four
canonical JSON seed files into apps/api/seeds/:

  referentials_annexes.json
  referentials_rubriques.json
  referentials_colonnes.json
  rules_structured.json

Usage (CLI args mandatory — zero defaults):

  uv run python ingest.py \\
    --xlsx-path <path-to-rdg.xlsx> \\
    --output-dir <path-to-apps/api/seeds/>

Doctrine: zero invented values. Fields without an XLSX source are
emitted as null. Idempotent — re-running with the same XLSX is a
no-op modulo whitespace differences.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import pandas as pd


SENTINEL_PATTERN = re.compile(r"^[CD]\d+$")
"""Sentinel codes (constants C0..C9, detail D1..D6) used in RDG terms but
not BCT rubriques. Filtered out of the rubriques referential."""


MISSING_OK_GUARD_TEMPLATE = """  -- Skip gracefully if session vars not configured (e.g. empty DB smoke test).
  IF current_setting('app.seed_tenant_id', true) IS NULL
    OR current_setting('app.seed_tenant_id', true) = ''
    OR current_setting('app.seed_author_user_id', true) IS NULL
    OR current_setting('app.seed_author_user_id', true) = ''
    OR current_setting('app.seed_valid_from', true) IS NULL
    OR current_setting('app.seed_valid_from', true) = '' THEN
    RAISE NOTICE 'migration {num}: session vars not set - skipping seed insert';
    RETURN;
  END IF;
"""
"""Standard prelude inserted at the top of every loader-function DO block.

current_setting(name, true) returns NULL with missing_ok semantics
instead of raising 'unrecognized configuration parameter'. The CI
migrations-smoke job runs `pnpm migrate:up` against an empty DB
without operator-supplied seed context — every seed migration must
no-op cleanly in that mode. The migration runs its INSERTs only
when the operator (or a test harness) explicitly SET the three
required GUCs.
"""


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Ingest RDG.xlsx into canonical JSON seeds for apps/api/seeds/."
    )
    p.add_argument("--xlsx-path", required=True, type=Path,
                   help="Path to rdg.xlsx (official BCT source).")
    p.add_argument("--output-dir", required=True, type=Path,
                   help="Directory where the 4 JSON seed files are written.")
    return p.parse_args()


def load_rdg(xlsx_path: Path) -> pd.DataFrame:
    df = pd.read_excel(
        xlsx_path,
        sheet_name="RDG",
        dtype=str,
        na_values=["nan", "NaN", "NA", "N/A", "", "none", "None"],
        keep_default_na=True,
    )
    df = df.where(pd.notna(df), None)
    return df


_NAN_LITERALS = frozenset({"nan", "NaN", "NA", "N/A", "none", "None", ""})


def _str_or_none(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s in _NAN_LITERALS:
        return None
    return s


def _int_or_none(v: Any) -> int | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def emit_annexes(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Distinct AX_TERM with its first-seen LIB_DOMAINE / LIB_ANNEXE."""
    grp = df.groupby("AX_TERM", sort=False).first().reset_index()
    result: list[dict[str, Any]] = []
    for _, row in grp.iterrows():
        result.append({
            "code": _str_or_none(row["AX_TERM"]),
            "label": _str_or_none(row["LIB_ANNEXE"]),
            "domain": _str_or_none(row["LIB_DOMAINE"]),
            "periodicity": None,
            "reporting_deadline_days": None,
            "xml_structure_type": None,
            "has_detail_sentinel": None,
        })
    return sorted(result, key=lambda x: x["code"] or "")


def emit_rubriques(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Distinct (AX_TERM, RUBRIQUE) pairs.

    Sentinels (constants C0..C9, details D1..D6) appear in RDG.AX_TERM
    and RDG.RUBRIQUE but are not BCT rubriques — they are filtered out.
    The remaining rubriques are real BCT 14-char codes.
    """
    mask = ~df["AX_TERM"].fillna("").astype(str).str.strip().str.match(
        SENTINEL_PATTERN, na=False
    )
    pairs = df[mask][["AX_TERM", "RUBRIQUE"]].drop_duplicates()
    seen: set[tuple[str, str]] = set()
    result: list[dict[str, Any]] = []
    for _, row in pairs.iterrows():
        rubrique = _str_or_none(row["RUBRIQUE"])
        annexe_code = _str_or_none(row["AX_TERM"])
        if rubrique is None or len(rubrique) != 14 or not rubrique.isalnum():
            continue
        key = (annexe_code or "", rubrique)
        if key in seen:
            continue
        seen.add(key)
        result.append({
            "code": rubrique,
            "label": None,
            "annexe_code": annexe_code,
            "parent_rubrique_code": None,
            "is_aggregate": None,
            "is_detail": None,
            "level": None,
        })
    return sorted(result, key=lambda x: (x["annexe_code"] or "", x["code"] or ""))


def emit_colonnes(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Distinct (AX_TERM, COLONNE) where COLONNE not null.

    BCT semantics: a "colonne" is the column of an annexe (a tabular
    report). Each annexe declares N numbered columns. Aggregating by
    (annexe, column_number) — not by (annexe, rubrique, column_number)
    — yields the canonical column directory. Synthesized code =
    `C<NNN>` zero-padded so codes sort numerically and remain unique
    within an annexe.
    """
    sub = df[df["COLONNE"].notna()][["AX_TERM", "COLONNE"]].drop_duplicates()
    seen: set[tuple[str, int]] = set()
    result: list[dict[str, Any]] = []
    for _, row in sub.iterrows():
        column_number = _int_or_none(row["COLONNE"])
        annexe_code = _str_or_none(row["AX_TERM"])
        if column_number is None:
            continue
        key = (annexe_code or "", column_number)
        if key in seen:
            continue
        seen.add(key)
        result.append({
            "code": f"C{column_number:03d}",
            "label": None,
            "annexe_code": annexe_code,
            "column_number": column_number,
            "data_type": None,
            "semantic_label": None,
        })
    return sorted(
        result,
        key=lambda x: (x["annexe_code"] or "", x["column_number"] or 0),
    )


def emit_rules_structured(df: pd.DataFrame) -> list[dict[str, Any]]:
    """4 611 rules with full terms structure aggregated from XLSX rows.

    A rule spans N RDG rows (one per term). Header fields (oper_regle,
    type_ctrl_computed, zone_texte) may appear on any of those rows —
    not necessarily the first encountered. We therefore promote any
    non-null header value seen in subsequent rows over a previously-
    stored null, mirroring pandas' `groupby().first()` semantics that
    pick the first non-null value per column.
    """
    rules: dict[tuple[str, int], dict[str, Any]] = {}
    for _, row in df.iterrows():
        ax_term = _str_or_none(row["AX_TERM"])
        num_regle = _int_or_none(row["NUM_REGLE"])
        if ax_term is None or num_regle is None:
            continue
        key = (ax_term, num_regle)
        oper_regle = _str_or_none(row["OPER_REGLE"])
        type_ctrl = _str_or_none(row["TYPE_CTRL"])
        zone_texte = _str_or_none(row["ZONE_TEXTE"])
        if key not in rules:
            rules[key] = {
                "ax_term": ax_term,
                "num_regle": num_regle,
                "oper_regle": oper_regle,
                "type_ctrl_computed": type_ctrl,
                "zone_texte": zone_texte,
                "terms": [],
            }
        else:
            # Promote any header field that's still null but available now.
            if rules[key]["oper_regle"] is None and oper_regle is not None:
                rules[key]["oper_regle"] = oper_regle
            if rules[key]["type_ctrl_computed"] is None and type_ctrl is not None:
                rules[key]["type_ctrl_computed"] = type_ctrl
            if rules[key]["zone_texte"] is None and zone_texte is not None:
                rules[key]["zone_texte"] = zone_texte
        rules[key]["terms"].append({
            "rang": _int_or_none(row["RANG_TERM"]),
            "ax_origine": _str_or_none(row["AX_ORIGINE"]),
            "rubrique": _str_or_none(row["RUBRIQUE"]),
            "colonne": _int_or_none(row["COLONNE"]),
            "oper_term": _str_or_none(row["OPER_TERM_REGLE"]),
            "num_seq": _int_or_none(row["NUM_SEQ"]),
        })

    result: list[dict[str, Any]] = []
    for rule in rules.values():
        terms = rule["terms"]
        ax_origines = sorted({
            t["ax_origine"]
            for t in terms
            if t["ax_origine"] and not t["ax_origine"].startswith(("C", "D"))
        })
        rule["terms_count"] = len(terms)
        rule["involved_annexes"] = ax_origines
        rule["is_inter_annexe"] = (
            len(ax_origines) > 1
            or (len(ax_origines) == 1 and ax_origines[0] != rule["ax_term"])
        )
        result.append(rule)

    return sorted(result, key=lambda x: (x["ax_term"], x["num_regle"]))


def write_json(records: list[dict[str, Any]], path: Path, label: str) -> None:
    payload = {
        "generated_by": "tools/ingest-rdg-xlsx/ingest.py",
        "source": "tests/fixtures/rdg.xlsx",
        "total": len(records),
        "records": records,
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[OK] {label}: {len(records)} records -> {path}")


def main() -> None:
    args = parse_args()
    if not args.xlsx_path.exists():
        print(f"ERROR: {args.xlsx_path} not found", file=sys.stderr)
        sys.exit(1)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading {args.xlsx_path}...")
    df = load_rdg(args.xlsx_path)
    print(f"Loaded {len(df)} rows, {len(df.columns)} columns")

    write_json(emit_annexes(df), args.output_dir / "referentials_annexes.json", "annexes")
    write_json(emit_rubriques(df), args.output_dir / "referentials_rubriques.json", "rubriques")
    write_json(emit_colonnes(df), args.output_dir / "referentials_colonnes.json", "colonnes")
    write_json(
        emit_rules_structured(df),
        args.output_dir / "rules_structured.json",
        "rules_structured",
    )


if __name__ == "__main__":
    main()
