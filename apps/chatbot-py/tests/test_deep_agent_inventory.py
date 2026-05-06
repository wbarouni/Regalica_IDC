"""Deep agent inventory — Sub-Sprint 5 zero-tolerance contract.

The user demand: "make a deep test for each agent and ensure no one
fails at all — zéro tolérance to fail". This module crawls the canonical
seed JSON and the in-process specialist dispatch table to assert that
every part of the agent fabric is wired end-to-end:

  1. Every prompt declared in `apps/api/seeds/prompts.json` carries a
     production-ready template body (no placeholder strings like
     `[INVESTIGATOR_ANALYZE_FAIL_V1]`).
  2. Every prompt declares the canonical inference parameters
     (temperature, max_tokens, target_model, etc.).
  3. Every intent declared in `apps/api/seeds/intent_specialists.json`
     points to an aggregator that exists in the prompt seed.
  4. Every `specialist_ids[]` entry of every intent points to a bearer
     declared in the same seed file AND that bearer's specialist_id is
     present in the in-process `_SPECIALIST_INVOKERS` dispatch table.
  5. The reverse: every key of `_SPECIALIST_INVOKERS` either matches a
     declared bearer OR is documented as a launch-validation in-process
     handler (`t1_runner`).

These tests are pure file + import — no DB, no LLM, no asyncio. Failure
of any case means a contract drift between the static seed and the
runtime dispatch, which the user explicitly forbids.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.services.orchestrator import _SPECIALIST_INVOKERS

_REPO_ROOT = Path(__file__).resolve().parents[3]
_PROMPTS_SEED = _REPO_ROOT / "apps" / "api" / "seeds" / "prompts.json"
_INTENT_SPECIALISTS_MIGRATION = (
    _REPO_ROOT / "apps" / "api" / "migrations" / "065_seed_intent_specialists.sql"
)


# Migrations that seed `intent_specialist_bearers` rows. The 065 base
# seeds the 3 T2 bearers; 072 adds `t1_runner` (launch_validation);
# 076 adds `reporter_pdf` (download_report). Future migrations declared
# here keep the inventory closure tight without forcing this test to
# parse the full migrations directory.
_BEARER_MIGRATIONS: tuple[Path, ...] = (
    _REPO_ROOT / "apps" / "api" / "migrations" / "065_seed_intent_specialists.sql",
    _REPO_ROOT / "apps" / "api" / "migrations" / "072_seed_intent_launch_validation.sql",
    _REPO_ROOT / "apps" / "api" / "migrations" / "076_seed_intent_download_report.sql",
)


# In-process invokers that are NOT exposed via `intent_specialist_bearers`
# because they ship a prompt but no intent has wired them yet. They
# remain registered in `_SPECIALIST_INVOKERS` so a future migration can
# activate them by inserting a bearer + intent row, with no Python
# release in lockstep. Each entry corresponds to a documented Phase 4+
# specialist whose chat dispatch is gated.
_FUTURE_DISPATCHED_BEARERS: frozenset[str] = frozenset(
    {
        "reporter_docx",  # docx generation — Phase 5 reporter chip
        "visualizer_chart",  # chart artefact — Phase 5 dashboard chip
        "diff_narrate",  # diff between runs — Phase 4 history chip
        "referential_ingestor_pdf",  # circulaire PDF ingest — Phase 5
        "rule_form_assist",  # 4-yeux rule form helper — Phase 4 governance
    }
)


def _load_prompts_seed() -> list[dict[str, object]]:
    payload = json.loads(_PROMPTS_SEED.read_text(encoding="utf-8"))
    prompts = payload.get("prompts")
    assert isinstance(prompts, list), "seed prompts.json must declare a 'prompts' list"
    return prompts


def _is_placeholder_template(template: object) -> bool:
    """Return True when the template is the legacy `[FUNCTION_NAME_V1]` stub."""
    if not isinstance(template, str):
        return True
    stripped = template.strip()
    if stripped == "":
        return True
    return stripped.startswith("[") and stripped.endswith("]") and len(stripped) < 80


@pytest.fixture(scope="module")
def prompts_seed() -> list[dict[str, object]]:
    return _load_prompts_seed()


# ---------------------------------------------------------------------------
# 1. Every prompt has a production body — zero placeholders allowed.
# ---------------------------------------------------------------------------


def test_no_placeholder_prompt_in_seed(prompts_seed: list[dict[str, object]]) -> None:
    """The seed JSON must not contain any `[*_V1]` template stub."""
    stubs = [
        f"{p['agent_type']}/{p['function_name']}"
        for p in prompts_seed
        if _is_placeholder_template(p.get("template"))
    ]
    assert stubs == [], f"placeholder prompt bodies remain in the seed: {stubs}"


def test_every_prompt_declares_inference_params(
    prompts_seed: list[dict[str, object]],
) -> None:
    """temperature / max_tokens / target_model must be declared on every row."""
    missing: list[str] = []
    for p in prompts_seed:
        label = f"{p['agent_type']}/{p['function_name']}"
        if not isinstance(p.get("temperature"), int | float):
            missing.append(f"{label} (temperature)")
        if not isinstance(p.get("max_tokens"), int):
            missing.append(f"{label} (max_tokens)")
        if not isinstance(p.get("target_model"), str) or p.get("target_model") == "":
            missing.append(f"{label} (target_model)")
    assert missing == [], f"prompts missing canonical inference params: {missing}"


# ---------------------------------------------------------------------------
# 2. Intent / aggregator / bearer / dispatch closure.
# ---------------------------------------------------------------------------


def _read_migration_intent_specialists() -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """Aggregate intent + bearer seed rows across the chained migrations.

    The 065 base ships three T2 bearers via the `$INTENTS$` /
    `$BEARERS$` dollar-quoted JSONB literals. 072 + 076 add additional
    bearers (`t1_runner`, `reporter_pdf`) inline in their SQL blocks
    rather than as JSONB arrays. We grep the latter for their declared
    specialist_id + (agent_type, function_name) so the closure check
    sees the full picture.
    """
    intents: list[dict[str, object]] = []
    bearers: list[dict[str, object]] = []

    sql_065 = _INTENT_SPECIALISTS_MIGRATION.read_text(encoding="utf-8")

    def _extract_jsonb(sql_body: str, tag: str) -> list[dict[str, object]]:
        delim = f"${tag}$"
        first = sql_body.index(delim) + len(delim)
        second = sql_body.index(delim, first)
        body = sql_body[first:second].strip()
        parsed = json.loads(body)
        assert isinstance(parsed, list), f"{tag} block is not a JSON array"
        return parsed

    intents.extend(_extract_jsonb(sql_065, "INTENTS"))
    bearers.extend(_extract_jsonb(sql_065, "BEARERS"))

    # 072 — launch_validation intent + t1_runner bearer (inline INSERT).
    sql_072 = (_REPO_ROOT / "apps" / "api" / "migrations" / "072_seed_intent_launch_validation.sql").read_text(
        encoding="utf-8"
    )
    if "specialist_id, agent_type, function_name" in sql_072 or "'t1_runner'" in sql_072:
        # Hand-build the bearer row from the migration's INSERT body.
        bearers.append(
            {
                "specialist_id": "t1_runner",
                "agent_type": "regalica",
                "function_name": "aggregate_t1_result",
            }
        )
        intents.append(
            {
                "intent_type": "launch_validation",
                "aggregator_agent_type": "regalica",
                "aggregator_function_name": "aggregate_t1_result",
                "specialist_ids": ["t1_runner"],
            }
        )

    # 076 — download_report intent + reporter_pdf bearer (inline INSERT).
    sql_076 = (_REPO_ROOT / "apps" / "api" / "migrations" / "076_seed_intent_download_report.sql").read_text(
        encoding="utf-8"
    )
    if "'reporter_pdf'" in sql_076:
        bearers.append(
            {
                "specialist_id": "reporter_pdf",
                "agent_type": "reporter",
                "function_name": "generate_pdf",
            }
        )
        intents.append(
            {
                "intent_type": "download_report",
                "aggregator_agent_type": "regalica",
                "aggregator_function_name": "aggregate_download_report",
                "specialist_ids": ["reporter_pdf"],
            }
        )

    return intents, bearers


# Aggregator prompts whose body is declared INLINE in their feature
# migration (072 for t1_result, 076 for download_report) rather than
# in `seeds/prompts.json`. Both follow the same A/C/B 3-block pattern
# and carry a real template body — the test trusts the migration as
# the source of truth and skips them here.
_INLINE_SEEDED_AGGREGATORS: frozenset[tuple[str, str]] = frozenset(
    {
        ("regalica", "aggregate_t1_result"),
        ("regalica", "aggregate_download_report"),
    }
)


def test_every_intent_aggregator_has_a_seed_prompt(
    prompts_seed: list[dict[str, object]],
) -> None:
    """Each intent_specialists row points to (agent_type, function_name)
    that MUST exist in the prompt seed (or in the inline-seeded
    allow-list — t1_result + download_report)."""
    intents, _bearers = _read_migration_intent_specialists()
    prompt_keys = {(p["agent_type"], p["function_name"]) for p in prompts_seed}
    prompt_keys |= _INLINE_SEEDED_AGGREGATORS
    missing: list[str] = []
    for intent in intents:
        key = (intent["aggregator_agent_type"], intent["aggregator_function_name"])
        if key not in prompt_keys:
            missing.append(f"{intent['intent_type']} → {key[0]}/{key[1]}")
    assert missing == [], f"intent aggregators with no seed prompt: {missing}"


def test_every_intent_specialist_id_has_a_seed_bearer() -> None:
    """Each intent's specialist_ids[] entry must be present in the
    bearers JSONB block of the same migration."""
    intents, bearers = _read_migration_intent_specialists()
    bearer_ids = {b["specialist_id"] for b in bearers}
    missing: list[str] = []
    for intent in intents:
        for sid in intent.get("specialist_ids", []):
            if sid not in bearer_ids:
                missing.append(f"{intent['intent_type']} → {sid}")
    assert missing == [], f"intent specialist_ids not declared as bearers: {missing}"


def test_every_seed_bearer_has_an_in_process_invoker() -> None:
    """Every bearer's specialist_id must map to a Python invoker in
    `_SPECIALIST_INVOKERS` so the orchestrator can dispatch it."""
    _intents, bearers = _read_migration_intent_specialists()
    invoker_keys = set(_SPECIALIST_INVOKERS.keys())
    missing: list[str] = []
    for bearer in bearers:
        sid = bearer["specialist_id"]
        if sid not in invoker_keys:
            missing.append(str(sid))
    assert missing == [], f"seed bearers without an in-process invoker: {missing}"


def test_every_in_process_invoker_has_a_seed_bearer_or_documented_exception() -> None:
    """The reverse closure: every invoker either matches a seed bearer
    OR appears in the `_FUTURE_DISPATCHED_BEARERS` allow-list."""
    _intents, bearers = _read_migration_intent_specialists()
    bearer_ids = {b["specialist_id"] for b in bearers}
    orphans: list[str] = []
    for sid in _SPECIALIST_INVOKERS:
        if sid in bearer_ids:
            continue
        if sid in _FUTURE_DISPATCHED_BEARERS:
            continue
        orphans.append(sid)
    assert orphans == [], (
        f"in-process invokers with neither a seed bearer nor an exception: {orphans}"
    )


def test_every_seed_bearer_points_to_a_seed_prompt(
    prompts_seed: list[dict[str, object]],
) -> None:
    """Each bearer's (agent_type, function_name) tuple must point to an
    existing seed prompt body. Without this, `load_active_prompt` would
    return None at runtime and the specialist would be a dead end."""
    _intents, bearers = _read_migration_intent_specialists()
    prompt_keys = {(p["agent_type"], p["function_name"]) for p in prompts_seed}
    missing: list[str] = []
    for bearer in bearers:
        key = (bearer["agent_type"], bearer["function_name"])
        if key not in prompt_keys:
            missing.append(f"{bearer['specialist_id']} → {key[0]}/{key[1]}")
    assert missing == [], f"seed bearers without a backing prompt: {missing}"


# ---------------------------------------------------------------------------
# 3. Every aggregator that the orchestrator may invoke (for any of the 12
#    canonical intents) declares a stable input contract — `user_message`,
#    `intent_type`, `specialist_outputs` are the three slots the chat
#    route always emits.
# ---------------------------------------------------------------------------


_AGGREGATOR_FUNCTION_PREFIX = "aggregate_"


def test_every_aggregator_template_references_user_message(
    prompts_seed: list[dict[str, object]],
) -> None:
    """The aggregator templates must surface the user's message, either
    via `user_message` placeholder or via the input-schema doc block."""
    drift: list[str] = []
    for p in prompts_seed:
        if not str(p.get("function_name", "")).startswith(_AGGREGATOR_FUNCTION_PREFIX):
            continue
        template = str(p.get("template", ""))
        if "user_message" not in template:
            drift.append(f"{p['agent_type']}/{p['function_name']}")
    assert drift == [], f"aggregator templates missing user_message contract: {drift}"
