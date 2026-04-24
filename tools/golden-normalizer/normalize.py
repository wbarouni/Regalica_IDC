"""REGFlow Golden Normalizer.

Normalise les XML BCT fournis par le Compliance Officer en une arborescence
canonique tests/fixtures/ prête pour le golden baseline REGFlow.

Opère en trois nomenclatures:
- Moderne (<Entete>, <Annexe>, <Rubrique>, <Colonne>)
- Ancienne (<ENTETE>, <DATE_DECLAR>, <BQ>, <CODE_ANNEXE>, <RECAP_POS>)
- Spécialisée (<TauxCrediteurs>, <TauxDebiteurs>, <Produit>, <Operation>)

Usage:
    uv run python normalize.py \\
        --source-dir /path/to/uploaded/xmls \\
        --target-dir ./tests/fixtures \\
        --tenant-slug tenant-001 \\
        --bank-code-placeholder BANK-CODE \\
        --bank-id-placeholder BANK-ID \\
        --tenant-name-pattern "QNB AL AHLI=TENANT-SUBSIDIARY" \\
        --tenant-name-pattern "QNB PARIS=TENANT-SUBSIDIARY" \\
        --tenant-name-pattern "QNB GROUP=TENANT-GROUP" \\
        --tenant-name-pattern "QNB=TENANT-NAME" \\
        --validation-author "Wissem Barouni" \\
        --report-file ./reports/normalization-YYYY-MM-DD.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Classification primitives
# ---------------------------------------------------------------------------


class Nomenclature(str, Enum):
    """XML nomenclature families supported by REGFlow parser."""

    MODERN = "modern"
    LEGACY = "legacy"
    SPECIALIZED_781 = "specialized_781"
    UNKNOWN = "unknown"


class FileStatus(str, Enum):
    """Classification outcome for a source XML."""

    FILLED = "filled"
    STRUCTURALLY_VALID_EMPTY = "structurally_valid_empty"
    STRUCTURAL_REFERENCE = "structural_reference"
    ANOMALY = "anomaly"


class ArreteType(str, Enum):
    """BCT reporting frequency types."""

    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMI_ANNUAL = "semi_annual"
    ANNUAL = "annual"
    AD_HOC = "ad_hoc"


# ---------------------------------------------------------------------------
# Data carriers
# ---------------------------------------------------------------------------


@dataclass
class ParsedMetadata:
    """Metadata extracted from one XML file regardless of nomenclature."""

    source_path: Path
    source_name: str
    source_size_bytes: int
    source_sha256: str
    nomenclature: Nomenclature
    code_banque: str | None
    date_annexe: str | None
    code_annexe: str | None
    data_values_count: int
    rubriques_detected: set[str] = field(default_factory=set)
    anomalies: list[str] = field(default_factory=list)

    @property
    def status(self) -> FileStatus:
        if self.anomalies and "no_date" in self.anomalies and "no_code_annexe" in self.anomalies:
            return FileStatus.ANOMALY
        if not self.date_annexe and self.code_annexe:
            return FileStatus.STRUCTURAL_REFERENCE
        if self.data_values_count == 0:
            return FileStatus.STRUCTURALLY_VALID_EMPTY
        return FileStatus.FILLED


@dataclass
class NormalizedFile:
    """One source XML mapped to its canonical target location."""

    metadata: ParsedMetadata
    status: FileStatus
    target_relative_path: Path
    target_sha256: str | None = None


@dataclass
class Batch:
    """Group of normalized files sharing one arrêté date."""

    batch_id: str
    tenant_slug: str
    bank_code_bct: str
    arrete_date: str
    arrete_type: ArreteType
    files: list[NormalizedFile] = field(default_factory=list)

    @property
    def filled_files(self) -> list[NormalizedFile]:
        return [f for f in self.files if f.status == FileStatus.FILLED]

    @property
    def empty_files(self) -> list[NormalizedFile]:
        return [f for f in self.files if f.status == FileStatus.STRUCTURALLY_VALID_EMPTY]

    @property
    def annexes_in_scope(self) -> list[str]:
        return sorted(
            {f.metadata.code_annexe for f in self.files if f.metadata.code_annexe},
            key=lambda x: (len(x), x),
        )


# ---------------------------------------------------------------------------
# Parsing utilities
# ---------------------------------------------------------------------------


METADATA_TAGS_TO_IGNORE = {
    "CodeBanque", "DateAnnexe", "CodeAnnexe",
    "CODE_ANNEXE", "BQ", "DATE_DECLAR", "DPOSC", "CMAJ",
    "Code_Banque", "Date_Annexe", "Code_Annexe",
}


def detect_nomenclature(content: str) -> Nomenclature:
    """Detect XML nomenclature by inspecting root-level markers."""
    if "<ENTETE>" in content:
        return Nomenclature.LEGACY
    if "<Entete>" in content:
        if "<TauxCrediteurs>" in content or "<TauxDebiteurs>" in content:
            return Nomenclature.SPECIALIZED_781
        return Nomenclature.MODERN
    if "<TauxCrediteurs>" in content or "<TauxDebiteurs>" in content:
        return Nomenclature.SPECIALIZED_781
    return Nomenclature.UNKNOWN


def extract_metadata(path: Path) -> ParsedMetadata:
    """Parse an XML file and extract all relevant metadata."""
    raw = path.read_bytes()
    sha256 = hashlib.sha256(raw).hexdigest()
    content = raw.decode("utf-8", errors="ignore")

    nomenclature = detect_nomenclature(content)

    code_banque = _first_match(content, r"<CodeBanque>([^<]*)</CodeBanque>") or \
        _first_match(content, r"<BQ>([^<]*)</BQ>")

    date_annexe_raw = _first_match(content, r"<DateAnnexe>([^<]*)</DateAnnexe>")
    date_annexe: str | None = None
    if date_annexe_raw:
        date_annexe = _normalize_date(date_annexe_raw)
    else:
        date_legacy = _first_match(content, r"<DATE_DECLAR>([^<]*)</DATE_DECLAR>")
        if date_legacy:
            date_annexe = _normalize_date(date_legacy)

    code_annexe = _first_match(content, r"<CodeAnnexe>([^<]*)</CodeAnnexe>") or \
        _first_match(content, r"<CODE_ANNEXE>([^<]*)</CODE_ANNEXE>")

    data_values_count = _count_data_values(content)
    rubriques = set(re.findall(r'<Rubrique id="([^"]+)"', content))

    anomalies: list[str] = []
    if not code_annexe:
        anomalies.append("no_code_annexe")
    if not date_annexe:
        anomalies.append("no_date")
    if not code_banque:
        anomalies.append("no_code_banque")

    return ParsedMetadata(
        source_path=path,
        source_name=path.name,
        source_size_bytes=path.stat().st_size,
        source_sha256=sha256,
        nomenclature=nomenclature,
        code_banque=code_banque,
        date_annexe=date_annexe,
        code_annexe=code_annexe,
        data_values_count=data_values_count,
        rubriques_detected=rubriques,
        anomalies=anomalies,
    )


def _first_match(content: str, pattern: str) -> str | None:
    """Return first regex match group stripped, or None if empty."""
    m = re.search(pattern, content)
    if not m:
        return None
    val = m.group(1).strip()
    return val if val else None


def _normalize_date(raw: str) -> str | None:
    """Normalize date to YYYY-MM-DD. Accept YYYYMMDD or DD/MM/YYYY."""
    raw = raw.strip()
    # YYYYMMDD form
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", raw)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{mo}-{d}"
    # DD/MM/YYYY form
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
    return None


TenantNamePattern = tuple[str, str]


def parse_tenant_name_patterns(raw_entries: list[str]) -> list[TenantNamePattern]:
    """Parse --tenant-name-pattern CLI args of the form PATTERN=REPLACEMENT.

    Returns pairs sorted by descending pattern length so the runner applies
    the longest phrases first. Without this ordering, a shorter 3-letter
    token would match inside a longer 'TOKEN SUFFIX' phrase before the
    full phrase is substituted, corrupting the output.
    """
    pairs: list[TenantNamePattern] = []
    for entry in raw_entries:
        if "=" not in entry:
            raise SystemExit(
                f"Invalid --tenant-name-pattern '{entry}', expected PATTERN=REPLACEMENT"
            )
        pattern, replacement = entry.split("=", 1)
        pattern = pattern.strip()
        replacement = replacement.strip()
        if not pattern:
            raise SystemExit(f"Empty pattern in --tenant-name-pattern '{entry}'")
        pairs.append((pattern, replacement))
    pairs.sort(key=lambda p: len(p[0]), reverse=True)
    return pairs


def apply_tenant_name_patterns(
    content: str,
    patterns: list[TenantNamePattern],
) -> str:
    """Substitute tenant-identifying strings in XML text content.

    Multi-word patterns (containing whitespace) match literally so inner
    spaces are preserved. Single-word patterns use word boundaries so the
    token does not match partially inside a longer word.
    """
    for pattern, replacement in patterns:
        if re.search(r"\s", pattern):
            regex = re.escape(pattern)
        else:
            regex = rf"\b{re.escape(pattern)}\b"
        content = re.sub(regex, replacement, content)
    return content


def write_anonymised_xml(
    src: Path,
    dst: Path,
    bank_code_placeholder: str,
    tenant_name_patterns: list[TenantNamePattern] | None = None,
) -> None:
    """Copy an XML to dst while anonymising tenant-identifying content.

    Two anonymisation layers are applied before the file is written:

    1. Header tags (<CodeBanque>, <BQ>, <Code_Banque>) are rewritten to
       the caller-supplied `bank_code_placeholder`.
    2. Text cells matching any of the `tenant_name_patterns` are rewritten
       to their replacement string (PATTERN=REPLACEMENT pairs).

    Numeric cell values are never touched: the header substitution targets
    only known header tags, and the tenant-name substitution targets
    patterns that are by nature non-numeric (legal names, group labels).
    Deterministic verdicts produced by the engine stay bit-identical.
    """
    import os

    content = src.read_text(encoding="utf-8", errors="ignore")
    for tag in ("CodeBanque", "BQ", "Code_Banque"):
        content = re.sub(
            rf"(<{tag}>)\s*[^<]+\s*(</{tag}>)",
            rf"\g<1>{bank_code_placeholder}\g<2>",
            content,
        )
    if tenant_name_patterns:
        content = apply_tenant_name_patterns(content, tenant_name_patterns)
    dst.write_text(content, encoding="utf-8")
    st = src.stat()
    os.utime(dst, (st.st_atime, st.st_mtime))


def _count_data_values(content: str) -> int:
    """Count non-empty leaf XML elements that carry data (all nomenclatures)."""
    leaves = re.findall(r"<([A-Za-z_][A-Za-z0-9_]*)[^>]*>([^<]+)</\1>", content)
    count = 0
    for tag, val in leaves:
        if tag in METADATA_TAGS_TO_IGNORE:
            continue
        if not val.strip():
            continue
        count += 1
    return count


# ---------------------------------------------------------------------------
# Arrêté type inference
# ---------------------------------------------------------------------------


def infer_arrete_type(date_str: str) -> ArreteType:
    """Infer whether the arrêté date is annual, quarterly, monthly."""
    if not date_str:
        return ArreteType.AD_HOC
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return ArreteType.AD_HOC
    month = d.month
    day = d.day
    # End of year
    if month == 12 and day == 31:
        return ArreteType.ANNUAL
    # End of quarter
    if (month, day) in [(3, 31), (6, 30), (9, 30)]:
        return ArreteType.QUARTERLY
    # End of semester
    if (month, day) in [(6, 30), (12, 31)]:
        return ArreteType.SEMI_ANNUAL
    # End of month
    if day >= 28:
        return ArreteType.MONTHLY
    return ArreteType.AD_HOC


# ---------------------------------------------------------------------------
# Target path planning
# ---------------------------------------------------------------------------


# Main current-year batches — drive the two-branch layout (current vs historical).
# Any arrêté date not in this set is routed under golden/<tenant>/historical/<date>/.
MAIN_ARRETE_DATES: frozenset[str] = frozenset({
    "2024-12-31",  # T4 annual
    "2026-02-28",  # monthly
    "2026-03-31",  # LCR quarterly
    "2024-09-30",  # T3 quarterly
})


def plan_target_path(
    meta: ParsedMetadata,
    target_root: Path,
    tenant_slug: str,
) -> tuple[FileStatus, Path]:
    """Decide target directory and canonical filename for a parsed XML."""
    status = meta.status

    if status == FileStatus.ANOMALY:
        # Unusable file, placed in anomalies/ subdir, keeps original name
        return status, target_root / "anomalies" / meta.source_name

    if status == FileStatus.STRUCTURAL_REFERENCE:
        # No usable date, ends up in structural-references/
        canonical_name = f"{meta.code_annexe}-structural-reference.xml"
        return status, target_root / "structural-references" / canonical_name

    assert meta.date_annexe is not None
    assert meta.code_annexe is not None

    canonical_name = f"{meta.code_annexe}-{meta.date_annexe}.xml"

    # Historical vs current batch root — same filled/ / structurally-valid-empty/
    # subfolder convention for both, so the golden test can discover XMLs
    # uniformly via <batch>/filled/*.xml.
    if _is_historical(meta.date_annexe):
        batch_dir = (
            target_root / "golden" / tenant_slug / "historical" / meta.date_annexe
        )
    else:
        batch_dir = target_root / "golden" / tenant_slug / meta.date_annexe

    subfolder = "filled" if status == FileStatus.FILLED else "structurally-valid-empty"
    return status, batch_dir / subfolder / canonical_name


def _is_historical(date_str: str) -> bool:
    """Decide if a date belongs to the historical subtree vs current batches."""
    return date_str not in MAIN_ARRETE_DATES


# ---------------------------------------------------------------------------
# Collision detection
# ---------------------------------------------------------------------------


def detect_collisions(planned: list[tuple[ParsedMetadata, FileStatus, Path]]) -> list[str]:
    """Return list of collision error messages, empty if none."""
    errors: list[str] = []
    by_target: dict[Path, list[ParsedMetadata]] = {}
    for meta, _status, target in planned:
        by_target.setdefault(target, []).append(meta)

    for target, metas in by_target.items():
        if len(metas) > 1:
            # Check if they are content-identical
            shas = {m.source_sha256 for m in metas}
            if len(shas) == 1:
                # Identical content, dedup automatically
                errors.append(
                    f"INFO collision content-identical on {target}: "
                    f"{[m.source_name for m in metas]} — keeping first, ignoring rest"
                )
            else:
                errors.append(
                    f"ERROR collision content-divergent on {target}: "
                    f"{[(m.source_name, m.source_sha256[:8]) for m in metas]}"
                )
    return errors


# ---------------------------------------------------------------------------
# expected_verdicts.json generator
# ---------------------------------------------------------------------------


def build_expected_verdicts(
    batch: Batch,
    validation_author: str,
    validation_author_role: str,
    validation_date: str,
) -> dict[str, Any]:
    """Generate the expected_verdicts.json skeleton for one batch."""
    filled = batch.filled_files
    empty = batch.empty_files
    annexes = batch.annexes_in_scope

    # Missing companions derived from dependency matrix
    companions_missing = _compute_missing_companions(set(annexes))

    expected_skips: dict[str, str] = {}
    for f in empty:
        if f.metadata.code_annexe:
            expected_skips[f.metadata.code_annexe] = "bct_accepted_empty"

    return {
        "$schema": "https://regflow.algoria.factory/schemas/expected_verdicts.v1.json",
        "batch_metadata": {
            "batch_id": batch.batch_id,
            "tenant_slug": batch.tenant_slug,
            "bank_code_bct": batch.bank_code_bct,
            "arrete_date": batch.arrete_date,
            "arrete_type": batch.arrete_type.value,
            "files_count_filled": len(filled),
            "files_count_structurally_valid_empty": len(empty),
            "total_annexes_covered": len(annexes),
        },
        "bct_submission": {
            "has_been_submitted": True,
            "submission_date": None,
            "bct_response_status": "accepted",
            "bct_response_file_available": False,
            "bct_response_file_path": None,
            "notes": None,
        },
        "validation_author": {
            "name": validation_author,
            "role": validation_author_role,
            "validation_date": validation_date,
            "validation_method": "manual_review_as_compliance_officer",
            "confidence_level": "high",
        },
        "expected_totals": {
            "rules_applicable_total": None,
            "pass": None,
            "fail_severe": 0,
            "fail_rounding": None,
            "skipped_missing_annexe": 0 if not companions_missing else None,
            "skipped_missing_rubrique": None,
            "skipped_missing_colonne": None,
            "skipped_missing_data": None,
            "skipped_conditional": None,
            "skipped_unsupported_op": None,
            "skipped_literal_text": None,
            "capture_mode": True,
        },
        "expected_fails": [],
        "expected_skips_by_annexe": expected_skips,
        "companion_annexes_missing_in_batch": companions_missing,
        "annexes_in_scope": annexes,
        "annexes_out_of_scope": [],
    }


# Dependency matrix — hardcoded from CC-tech §9.5 + circ. 2018-06 / 2018-10
DEPENDENCIES: dict[str, list[str]] = {
    "00": [],
    "01": ["00"],
    "02": ["00", "01"],
    "47": ["00", "01", "51"],
    "51": ["00"],
    "481": ["00", "01"], "482": ["00", "01"], "483": ["00", "01"],
    "484": ["00", "01"], "485": ["00", "01"], "486": ["00", "01"],
    "510": ["00"], "520": ["00", "51"], "530": ["00", "51"],
    "540": ["00"], "550": ["00"], "560": ["00"],
    "620": ["00"], "630": ["00"], "640": ["00"],
    "910": ["00"],
}


def _compute_missing_companions(annexes_present: set[str]) -> list[dict[str, Any]]:
    """For each annexe present, list its missing companion dependencies."""
    missing: dict[str, dict[str, Any]] = {}
    for ann in annexes_present:
        deps = DEPENDENCIES.get(ann, [])
        for dep in deps:
            if dep not in annexes_present:
                entry = missing.setdefault(
                    dep,
                    {
                        "annexe_code": dep,
                        "required_by": [],
                        "dependency_source": "CC-tech §9.5 or circ. 2018-06",
                        "consequence": "skipped_missing_annexe verdicts on inter-annexe rules",
                        "justification_for_absence": None,
                    },
                )
                entry["required_by"].append(ann)
    # Sort required_by lists for determinism
    for entry in missing.values():
        entry["required_by"] = sorted(entry["required_by"], key=lambda x: (len(x), x))
    return sorted(missing.values(), key=lambda e: e["annexe_code"])


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------


def run(
    source_dir: Path,
    target_dir: Path,
    tenant_slug: str,
    validation_author: str,
    validation_author_role: str,
    report_file: Path | None,
    dry_run: bool,
    bank_code_placeholder: str = "BANK-CODE",
    bank_id_placeholder: str = "BANK-ID",
    tenant_name_patterns: list[TenantNamePattern] | None = None,
) -> dict[str, Any]:
    """Execute the full normalization pipeline and return a report dict."""
    started_at = datetime.now(timezone.utc).isoformat()

    # 1. Scan source directory
    # Single walk with case-insensitive suffix match so Windows NTFS
    # (case-insensitive rglob) doesn't report each file twice when we
    # union "*.xml" and "*.XML".
    source_files = sorted(
        p for p in source_dir.rglob("*") if p.is_file() and p.suffix.lower() == ".xml"
    )
    if not source_files:
        raise SystemExit(f"No XML files found under {source_dir}")

    # 2. Parse metadata for each file
    parsed: list[ParsedMetadata] = [extract_metadata(f) for f in source_files]

    # 3. Plan target locations
    planned: list[tuple[ParsedMetadata, FileStatus, Path]] = []
    for meta in parsed:
        status, target = plan_target_path(meta, target_dir, tenant_slug)
        planned.append((meta, status, target))

    # 4. Detect collisions
    collisions = detect_collisions(planned)
    hard_errors = [c for c in collisions if c.startswith("ERROR")]
    if hard_errors and not dry_run:
        for err in hard_errors:
            print(f"  {err}", file=sys.stderr)
        raise SystemExit("Content-divergent collisions detected, aborting")

    # 5. Group by batch (for dated files only)
    batches: dict[str, Batch] = {}
    for meta, status, target in planned:
        if status == FileStatus.ANOMALY:
            continue
        if status == FileStatus.STRUCTURAL_REFERENCE:
            continue
        assert meta.date_annexe is not None
        key = meta.date_annexe
        if key not in batches:
            batches[key] = Batch(
                batch_id=f"{tenant_slug}-{meta.date_annexe}",
                tenant_slug=tenant_slug,
                bank_code_bct=bank_code_placeholder,
                arrete_date=meta.date_annexe,
                arrete_type=infer_arrete_type(meta.date_annexe),
            )
        rel = target.relative_to(target_dir) if target_dir in target.parents else target
        nf = NormalizedFile(metadata=meta, status=status, target_relative_path=rel)
        batches[key].files.append(nf)

    # 6. Copy files to target (unless dry-run)
    copies_count = 0
    copies_skipped = 0
    if not dry_run:
        seen_targets: set[Path] = set()
        for meta, status, target in planned:
            # Anomalies fall through to the copy path: plan_target_path has
            # already routed them under anomalies/ so they land preserved
            # for manual inspection rather than being silently dropped.
            if target in seen_targets:
                copies_skipped += 1
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            write_anonymised_xml(
                meta.source_path,
                target,
                bank_code_placeholder,
                tenant_name_patterns,
            )
            seen_targets.add(target)
            copies_count += 1

        # 7. Write expected_verdicts.json per batch
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for batch in batches.values():
            # Locate batch dir
            if _is_historical(batch.arrete_date):
                batch_dir = target_dir / "golden" / tenant_slug / "historical" / batch.arrete_date
            else:
                batch_dir = target_dir / "golden" / tenant_slug / batch.arrete_date
            batch_dir.mkdir(parents=True, exist_ok=True)
            expected = build_expected_verdicts(
                batch, validation_author, validation_author_role, today
            )
            (batch_dir / "expected_verdicts.json").write_text(
                json.dumps(expected, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

    # 8. Build report
    report: dict[str, Any] = {
        "normalizer_version": "1.0.0",
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "source_dir": str(source_dir),
        "target_dir": str(target_dir),
        "tenant_slug": tenant_slug,
        "totals": {
            "source_files_scanned": len(source_files),
            "files_copied": copies_count,
            "files_skipped_dedup": copies_skipped,
            "batches_detected": len(batches),
            "filled": sum(1 for _, s, _ in planned if s == FileStatus.FILLED),
            "structurally_valid_empty": sum(
                1 for _, s, _ in planned if s == FileStatus.STRUCTURALLY_VALID_EMPTY
            ),
            "structural_references": sum(
                1 for _, s, _ in planned if s == FileStatus.STRUCTURAL_REFERENCE
            ),
            "anomalies": sum(1 for _, s, _ in planned if s == FileStatus.ANOMALY),
        },
        "nomenclatures": _count_by_attr(parsed, "nomenclature"),
        "batches": [
            {
                "batch_id": b.batch_id,
                "arrete_date": b.arrete_date,
                "arrete_type": b.arrete_type.value,
                "bank_code_bct": b.bank_code_bct,
                "files_filled": len(b.filled_files),
                "files_empty": len(b.empty_files),
                "annexes_in_scope": b.annexes_in_scope,
                "missing_companions": [
                    m["annexe_code"]
                    for m in _compute_missing_companions(set(b.annexes_in_scope))
                ],
            }
            for b in sorted(batches.values(), key=lambda x: x.arrete_date)
        ],
        "collisions": collisions,
        "per_file": [
            {
                "source_name": meta.source_name,
                "nomenclature": meta.nomenclature.value,
                "code_banque": bank_code_placeholder,
                "date_annexe": meta.date_annexe,
                "code_annexe": meta.code_annexe,
                "data_values_count": meta.data_values_count,
                "status": status.value,
                "target_relative": str(target.relative_to(target_dir))
                if target_dir in target.parents else str(target),
                "source_sha256": meta.source_sha256,
                "anomalies": meta.anomalies,
            }
            for meta, status, target in planned
        ],
    }

    if report_file:
        report_file.parent.mkdir(parents=True, exist_ok=True)
        report_file.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    return report


def _count_by_attr(items: list[Any], attr: str) -> dict[str, int]:
    """Count items grouped by attribute value."""
    counts: dict[str, int] = {}
    for item in items:
        val = getattr(item, attr)
        key = val.value if isinstance(val, Enum) else str(val)
        counts[key] = counts.get(key, 0) + 1
    return counts


# ---------------------------------------------------------------------------
# CLI entry
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="REGFlow Golden Normalizer — canonicalize BCT XML fixtures."
    )
    parser.add_argument("--source-dir", type=Path, required=True,
                        help="Directory containing source XML files")
    parser.add_argument("--target-dir", type=Path, required=True,
                        help="Target tests/fixtures/ directory")
    parser.add_argument("--tenant-slug", type=str, default="tenant-001",
                        help="Tenant slug used in target paths and metadata (default: tenant-001)")
    parser.add_argument("--bank-code-placeholder", type=str, default="BANK-CODE",
                        help="Placeholder written in <CodeBanque>/<BQ>/<Code_Banque> tags and bank_code_bct metadata, overriding the real source code")
    parser.add_argument("--bank-id-placeholder", type=str, default="BANK-ID",
                        help="Placeholder reserved for future substitution of matricule patterns in filenames or anomalies/")
    parser.add_argument(
        "--tenant-name-pattern",
        type=str,
        action="append",
        default=[],
        help=(
            "Substitute a tenant-identifying string in XML text cells. "
            "Format: PATTERN=REPLACEMENT. May be repeated for several patterns. "
            "Multi-word patterns match literally; single-word patterns use \\b word boundaries. "
            "Longest patterns are applied first regardless of CLI order."
        ),
    )
    parser.add_argument("--validation-author", type=str, required=True,
                        help="Full name of the Compliance Officer validating")
    parser.add_argument("--validation-author-role", type=str,
                        default="CEO ALGORIA Factory / Head of Financial & Regulatory Reporting",
                        help="Role of the validation author")
    parser.add_argument("--report-file", type=Path, default=None,
                        help="Path for the JSON normalization report")
    parser.add_argument("--dry-run", action="store_true",
                        help="Plan and report without copying files")
    args = parser.parse_args()

    if not args.source_dir.is_dir():
        raise SystemExit(f"Source dir not found: {args.source_dir}")

    tenant_name_patterns = parse_tenant_name_patterns(args.tenant_name_pattern)

    report = run(
        source_dir=args.source_dir,
        target_dir=args.target_dir,
        tenant_slug=args.tenant_slug,
        validation_author=args.validation_author,
        validation_author_role=args.validation_author_role,
        report_file=args.report_file,
        dry_run=args.dry_run,
        bank_code_placeholder=args.bank_code_placeholder,
        bank_id_placeholder=args.bank_id_placeholder,
        tenant_name_patterns=tenant_name_patterns,
    )

    t = report["totals"]
    print(f"✓ Normalization complete")
    print(f"  Source files scanned: {t['source_files_scanned']}")
    print(f"  Filled: {t['filled']}")
    print(f"  Structurally valid empty: {t['structurally_valid_empty']}")
    print(f"  Structural references: {t['structural_references']}")
    print(f"  Anomalies: {t['anomalies']}")
    print(f"  Batches detected: {t['batches_detected']}")
    if not args.dry_run:
        print(f"  Files copied: {t['files_copied']}")
        print(f"  Files skipped (dedup): {t['files_skipped_dedup']}")
    for b in report["batches"]:
        missing_str = f", missing_companions={b['missing_companions']}" if b["missing_companions"] else ""
        print(f"    {b['arrete_date']} [{b['arrete_type']}]: "
              f"{b['files_filled']} filled, {b['files_empty']} empty{missing_str}")
    if report.get("collisions"):
        print("  Collisions/warnings:")
        for c in report["collisions"]:
            print(f"    {c}")


if __name__ == "__main__":
    main()
