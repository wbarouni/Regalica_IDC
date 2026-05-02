"""Unit tests for POST /upload — mocked pool, agents, and LLM client.

The route reads workflow_steps T0 from the DB, runs each deterministic
agent in order via a static dispatch dict, then renders the
regalica/xml_received prompt to compose a user-facing briefing. Each
piece is mocked with AsyncMock so the suite stays in-process.
"""

from __future__ import annotations

import zlib
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.llm.base import LLMResponse
from app.main import app
from app.routes.chat import get_llm_client, get_pool
from app.routes.upload import get_engine_client
from app.services import platform_config as platform_config_module
from fastapi import status
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _seed_temporal_calendar_cache() -> Iterator[None]:
    """Pre-populate the platform_config cache with the canonical calendar.

    Migration 062 seeds `temporal_arrete_calendar` in production; the
    upload route's TemporalAgent reads it through the cached loader.
    Without this fixture the loader would call mock_pool.fetchrow once
    per test (returning None) and the agent would fail every run with a
    PlatformConfigMissingError. Pre-populating the cache mirrors the
    real production state and removes the need for every existing spec
    to know about the loader's internals.
    """
    platform_config_module.reset_platform_config_cache()
    platform_config_module._CACHE["temporal_arrete_calendar"] = {
        "quarterly_end_months": [3, 6, 9, 12],
        "annual_month": 12,
        "annual_day": 31,
    }
    yield
    platform_config_module.reset_platform_config_cache()


_VALID_XML = (
    "<?xml version='1.0' encoding='UTF-8'?>"
    "<DeclarationBCT>"
    "<Entete>"
    "<CodeBanque>BANK-CODE</CodeBanque>"
    "<CodeAnnexe>RSM630</CodeAnnexe>"
    "<DateAnnexe>20240331</DateAnnexe>"
    "</Entete>"
    "<Rubrique><Code>R001</Code></Rubrique>"
    "</DeclarationBCT>"
)


def _llm_response(content: str) -> LLMResponse:
    return LLMResponse(
        content=content,
        thinking_trace=None,
        tokens_input=10,
        tokens_output=5,
        tokens_thinking=0,
        latency_ms=42,
        model_used="gemini-2.5-flash",
    )


def _xml_upload_row(xml: str = _VALID_XML) -> dict[str, Any]:
    """Mimic the asyncpg row returned by SELECT … FROM xml_uploads."""
    return {
        "content_compressed": zlib.compress(xml.encode("utf-8"))
        if False
        else _gzip(xml.encode("utf-8")),
        "compression_algo": "gzip",
        "encoding_detected": "utf-8",
    }


def _gzip(data: bytes) -> bytes:
    """Return a gzip stream zlib can decompress with wbits=MAX|16."""
    import gzip

    return gzip.compress(data)


def _t0_steps() -> list[dict[str, Any]]:
    return [
        {"step_order": 1, "agent_type": "ingestor_xml", "function_name": "parse_xml"},
        {"step_order": 2, "agent_type": "dependency", "function_name": "check_companions"},
        {"step_order": 3, "agent_type": "temporal", "function_name": "check_dates"},
    ]


@pytest.fixture
def mock_pool() -> MagicMock:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    # _seed_run_agent_steps acquires a connection then runs
    # executemany + fetch on it. Mock the async-context-manager contract
    # plus both async methods so tests don't need a real DB.
    conn = MagicMock()
    conn.executemany = AsyncMock()
    # Default seed lookup returns no rows -> step_id is None -> the
    # route silently skips notify_agent_step. Tests that verify the
    # seed contract override this to inject deterministic step_ids.
    conn.fetch = AsyncMock(return_value=[])
    acquire_cm = MagicMock()
    acquire_cm.__aenter__ = AsyncMock(return_value=conn)
    acquire_cm.__aexit__ = AsyncMock(return_value=None)
    pool.acquire = MagicMock(return_value=acquire_cm)
    pool._seed_conn = conn  # exposed for tests that want to assert on it
    return pool


@pytest.fixture
def mock_llm() -> MagicMock:
    client = MagicMock()
    client.complete = AsyncMock()
    return client


@pytest.fixture
def mock_engine() -> MagicMock:
    """RegflowApiClient stand-in.

    notify_agent_step + persist_message are both AsyncMock so test cases
    can introspect call_args, configure return values, or raise to
    exercise the best-effort error swallowing in /upload.
    """
    eng = MagicMock()
    eng.notify_agent_step = AsyncMock(return_value={"data": {}})
    eng.persist_message = AsyncMock(return_value={"data": {}})
    eng.aclose = AsyncMock(return_value=None)
    return eng


@pytest.fixture
def client(
    mock_pool: MagicMock, mock_llm: MagicMock, mock_engine: MagicMock
) -> Iterator[TestClient]:
    app.dependency_overrides[get_pool] = lambda: mock_pool
    app.dependency_overrides[get_llm_client] = lambda: mock_llm
    app.dependency_overrides[get_engine_client] = lambda: mock_engine
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _payload() -> dict[str, Any]:
    return {
        "run_id": "00000000-0000-0000-0000-000000000010",
        "primary_upload_id": "00000000-0000-0000-0000-000000000001",
        "upload_ids": ["00000000-0000-0000-0000-000000000001"],
        "arrete_date": "2024-03-31",
        "tenant_id": "00000000-0000-0000-0000-000000000099",
    }


# --------------------------- specs ---------------------------


def test_upload_returns_503_when_workflow_steps_empty(
    client: TestClient,
    mock_pool: MagicMock,
) -> None:
    mock_pool.fetch.return_value = []
    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert "workflow_steps" in res.json()["detail"]


def test_upload_dispatches_all_t0_agents_in_db_order(
    client: TestClient,
    mock_pool: MagicMock,
    mock_llm: MagicMock,
) -> None:
    # fetch sequence:
    #   1. _load_t0_steps               -> 3 T0 rows
    #   2. _load_upload_annexes         -> [RSM630]
    #   3. DependencyAgent internal fetch on referentials_annexe_dependencies -> []
    mock_pool.fetch.side_effect = [
        _t0_steps(),
        [{"code_annexe": "RSM630"}],
        [],
    ]
    # fetchrow sequence:
    #   1. _load_upload_content (xml row)
    #   2. load_active_prompt(regalica/xml_received) -> None (briefing skipped)
    mock_pool.fetchrow.side_effect = [_xml_upload_row(), None]
    mock_llm.complete.return_value = _llm_response("Réception confirmée.")

    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_200_OK, res.text
    body = res.json()
    assert body["status"] == "t0_complete"
    assert [s["agent_type"] for s in body["steps"]] == [
        "ingestor_xml",
        "dependency",
        "temporal",
    ]
    assert all(s["success"] for s in body["steps"])


def test_upload_respects_arbitrary_db_ordering(
    client: TestClient,
    mock_pool: MagicMock,
    mock_llm: MagicMock,
) -> None:
    """If DB returns steps in a different order, agents fire in that order."""
    reversed_steps = [
        {"step_order": 3, "agent_type": "temporal", "function_name": "check_dates"},
        {"step_order": 1, "agent_type": "ingestor_xml", "function_name": "parse_xml"},
    ]
    # fetch:
    #   1. workflow_steps -> [temporal, ingestor_xml]
    # (no DependencyAgent in this scenario, no _load_upload_annexes call)
    mock_pool.fetch.side_effect = [reversed_steps]
    # fetchrow:
    #   1. _load_upload_content for ingestor_xml
    #   2. load_active_prompt -> None (briefing skipped)
    mock_pool.fetchrow.side_effect = [_xml_upload_row(), None]
    mock_llm.complete.return_value = _llm_response("ok")

    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_200_OK, res.text
    body = res.json()
    assert [s["agent_type"] for s in body["steps"]] == ["temporal", "ingestor_xml"]


def test_upload_short_circuits_after_failed_step(
    client: TestClient,
    mock_pool: MagicMock,
) -> None:
    mock_pool.fetch.return_value = _t0_steps()
    mock_pool.fetchrow.return_value = _xml_upload_row("<malformed")

    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_200_OK, res.text
    body = res.json()
    # ingestor_xml fails on the malformed body -> dependency + temporal
    # never run, briefing is None.
    assert body["status"] == "t0_failed"
    assert body["steps"][0]["success"] is False
    assert len(body["steps"]) == 1
    assert body["briefing"] is None


def test_upload_skips_briefing_when_prompt_missing(
    client: TestClient,
    mock_pool: MagicMock,
    mock_llm: MagicMock,
) -> None:
    mock_pool.fetch.side_effect = [
        _t0_steps(),
        [{"code_annexe": "RSM630"}],
        [],  # DependencyAgent internal fetch
    ]
    mock_pool.fetchrow.side_effect = [
        _xml_upload_row(),  # _load_upload_content
        None,  # load_active_prompt(regalica/xml_received) miss
    ]

    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_200_OK, res.text
    body = res.json()
    assert body["status"] == "t0_complete"
    assert body["briefing"] is None
    mock_llm.complete.assert_not_called()


def test_upload_renders_briefing_when_prompt_active(
    client: TestClient,
    mock_pool: MagicMock,
    mock_llm: MagicMock,
) -> None:
    mock_pool.fetch.side_effect = [
        _t0_steps(),
        [{"code_annexe": "RSM630"}],
        [],  # DependencyAgent internal fetch
    ]
    mock_pool.fetchrow.side_effect = [
        _xml_upload_row(),
        {
            "template": "RSM630={annexe_code} arr={arrete_date}",
            "temperature": 0.7,
            "max_tokens": 1024,
            "thinking_enabled": False,
            "target_model": "gemini-2.5-flash",
            "output_contract": "string",
        },
    ]
    mock_llm.complete.return_value = _llm_response("Réception confirmée pour RSM630.")

    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_200_OK, res.text
    body = res.json()
    assert body["status"] == "t0_complete"
    assert body["briefing"] is not None
    assert body["briefing"]["message"] == "Réception confirmée pour RSM630."
    # Prompt template was rendered with the runtime values.
    args, _kwargs = mock_llm.complete.call_args
    assert "RSM630=RSM630" in args[0].prompt
    assert "arr=2024-03-31" in args[0].prompt


def test_upload_unknown_agent_type_aborts_pipeline(
    client: TestClient,
    mock_pool: MagicMock,
) -> None:
    mock_pool.fetch.return_value = [
        {"step_order": 1, "agent_type": "invented_agent", "function_name": "do_something"},
    ]
    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_200_OK, res.text
    body = res.json()
    assert body["status"] == "t0_failed"
    assert body["steps"][0]["error"] is not None
    assert "no python dispatcher" in body["steps"][0]["error"]


def test_upload_notifies_engine_for_each_step_transition(
    client: TestClient,
    mock_pool: MagicMock,
    mock_llm: MagicMock,
    mock_engine: MagicMock,
) -> None:
    """Each successful T0 step triggers two notify calls: current + done."""
    mock_pool.fetch.side_effect = [
        _t0_steps(),
        [{"code_annexe": "RSM630"}],
        [],  # DependencyAgent internal fetch
    ]
    mock_pool.fetchrow.side_effect = [_xml_upload_row(), None]
    mock_llm.complete.return_value = _llm_response("ok")
    # _seed_run_agent_steps reads back step_ids from the seed connection.
    mock_pool._seed_conn.fetch.return_value = [
        {
            "id": "00000000-0000-7000-8000-000000000010",
            "agent_type": "ingestor_xml",
            "function_name": "parse_xml",
        },
        {
            "id": "00000000-0000-7000-8000-000000000011",
            "agent_type": "dependency",
            "function_name": "check_companions",
        },
        {
            "id": "00000000-0000-7000-8000-000000000012",
            "agent_type": "temporal",
            "function_name": "check_dates",
        },
    ]

    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_200_OK, res.text

    # 3 steps x 2 transitions = 6 notify_agent_step calls.
    assert mock_engine.notify_agent_step.await_count == 6
    transitions = [c.kwargs["new_status"] for c in mock_engine.notify_agent_step.await_args_list]
    assert transitions == ["current", "done", "current", "done", "current", "done"]
    # Each call addresses the step_id seeded for its (agent_type, function_name).
    step_ids = [c.kwargs["step_id"] for c in mock_engine.notify_agent_step.await_args_list]
    assert step_ids == [
        "00000000-0000-7000-8000-000000000010",
        "00000000-0000-7000-8000-000000000010",
        "00000000-0000-7000-8000-000000000011",
        "00000000-0000-7000-8000-000000000011",
        "00000000-0000-7000-8000-000000000012",
        "00000000-0000-7000-8000-000000000012",
    ]
    mock_engine.aclose.assert_awaited_once()


def test_upload_notify_failure_does_not_abort_pipeline(
    client: TestClient,
    mock_pool: MagicMock,
    mock_llm: MagicMock,
    mock_engine: MagicMock,
) -> None:
    """An engine notify failure is logged + swallowed, T0 still completes."""
    from app.clients.regflow_api import RegflowApiError

    mock_pool.fetch.side_effect = [
        _t0_steps(),
        [{"code_annexe": "RSM630"}],
        [],
    ]
    mock_pool.fetchrow.side_effect = [_xml_upload_row(), None]
    mock_llm.complete.return_value = _llm_response("ok")
    mock_pool._seed_conn.fetch.return_value = [
        {
            "id": "00000000-0000-7000-8000-000000000010",
            "agent_type": "ingestor_xml",
            "function_name": "parse_xml",
        },
        {
            "id": "00000000-0000-7000-8000-000000000011",
            "agent_type": "dependency",
            "function_name": "check_companions",
        },
        {
            "id": "00000000-0000-7000-8000-000000000012",
            "agent_type": "temporal",
            "function_name": "check_dates",
        },
    ]
    mock_engine.notify_agent_step.side_effect = RegflowApiError(
        500, "boom", endpoint="/runs/x/agent-steps/y"
    )

    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_200_OK, res.text
    body = res.json()
    assert body["status"] == "t0_complete"
    # All 3 agents still ran end-to-end despite engine notify failures.
    assert len(body["steps"]) == 3


def test_upload_persists_briefing_when_conversation_id_supplied(
    client: TestClient,
    mock_pool: MagicMock,
    mock_llm: MagicMock,
    mock_engine: MagicMock,
) -> None:
    mock_pool.fetch.side_effect = [
        _t0_steps(),
        [{"code_annexe": "RSM630"}],
        [],
    ]
    mock_pool.fetchrow.side_effect = [
        _xml_upload_row(),
        {
            "template": "RSM630={annexe_code}",
            "temperature": 0.7,
            "max_tokens": 1024,
            "thinking_enabled": False,
            "target_model": "gemini-2.5-flash",
            "output_contract": "string",
        },
    ]
    mock_llm.complete.return_value = _llm_response("Réception confirmée pour RSM630.")

    payload = _payload()
    payload["conversation_id"] = "00000000-0000-7000-8000-0000000000aa"
    res = client.post("/upload", json=payload)
    assert res.status_code == status.HTTP_200_OK, res.text

    mock_engine.persist_message.assert_awaited_once()
    call = mock_engine.persist_message.await_args
    assert call.kwargs["conversation_id"] == "00000000-0000-7000-8000-0000000000aa"
    assert call.kwargs["tenant_id"] == payload["tenant_id"]
    assert call.kwargs["content"] == "Réception confirmée pour RSM630."
    assert call.kwargs["role"] == "assistant"
    assert call.kwargs["run_id"] == payload["run_id"]
    assert call.kwargs["produced_by_agent"] == "regalica"


def test_upload_skips_persist_when_no_conversation_id(
    client: TestClient,
    mock_pool: MagicMock,
    mock_llm: MagicMock,
    mock_engine: MagicMock,
) -> None:
    mock_pool.fetch.side_effect = [
        _t0_steps(),
        [{"code_annexe": "RSM630"}],
        [],
    ]
    mock_pool.fetchrow.side_effect = [
        _xml_upload_row(),
        {
            "template": "ok={annexe_code}",
            "temperature": 0.7,
            "max_tokens": 1024,
            "thinking_enabled": False,
            "target_model": "gemini-2.5-flash",
            "output_contract": "string",
        },
    ]
    mock_llm.complete.return_value = _llm_response("ok")

    res = client.post("/upload", json=_payload())
    assert res.status_code == status.HTTP_200_OK, res.text
    mock_engine.persist_message.assert_not_awaited()
