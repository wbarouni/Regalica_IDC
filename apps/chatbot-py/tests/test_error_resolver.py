"""Pure tests for app.domain.error_resolver — no DB, no HTTP.

Validates :
  * load() reads exactly the codes returned by SELECT (catalogue
    binding tested via from_codes constructor).
  * Every canonical code from the source-of-truth set is recognised.
  * The exception → code mapping covers every Tranche 0 case.
  * Unknown codes raise UnknownErrorCodeError (safety net for a
    new code added in source without the corresponding seed entry).
"""

from __future__ import annotations

import pytest
from app.domain.error_resolver import (
    T0_EMBEDDED_FAIL,
    T0_PARSE_ERROR,
    T0_XSD_INVALID,
    T1_ENGINE_EXCEPTION,
    T1_NO_VERDICTS,
    T1_TIMEOUT,
    ErrorResolver,
    UnknownErrorCodeError,
    all_canonical_codes,
)
from app.exceptions import (
    EvaluationError,
    EvaluationTimeoutError,
    SpecialistParsingError,
    T1RejectionError,
)


@pytest.fixture
def resolver() -> ErrorResolver:
    return ErrorResolver.from_codes(all_canonical_codes())


def test_all_canonical_codes_match_tranche_0_set() -> None:
    """The source-of-truth set MUST be exactly the 6 Tranche 0 codes."""
    assert all_canonical_codes() == frozenset(
        {
            T0_XSD_INVALID,
            T0_EMBEDDED_FAIL,
            T0_PARSE_ERROR,
            T1_ENGINE_EXCEPTION,
            T1_NO_VERDICTS,
            T1_TIMEOUT,
        },
    )


class TestAssertKnown:
    def test_returns_code_unchanged_when_registered(self, resolver: ErrorResolver) -> None:
        assert resolver.assert_known(T1_TIMEOUT) == T1_TIMEOUT

    def test_raises_on_unknown_code(self, resolver: ErrorResolver) -> None:
        with pytest.raises(UnknownErrorCodeError) as excinfo:
            resolver.assert_known("never_seeded_code")
        assert "never_seeded_code" in str(excinfo.value)
        assert "run_error_codes" in str(excinfo.value)


class TestT1ExceptionMapping:
    def test_evaluation_timeout_maps_to_t1_timeout(self, resolver: ErrorResolver) -> None:
        exc = EvaluationTimeoutError(run_id="abc", timeout_seconds=30.0)
        assert resolver.from_t1_exception(exc) == T1_TIMEOUT

    def test_evaluation_error_maps_to_t1_engine_exception(self, resolver: ErrorResolver) -> None:
        exc = EvaluationError("boom", status_code=500)
        assert resolver.from_t1_exception(exc) == T1_ENGINE_EXCEPTION

    def test_t1_rejection_step_1_maps_to_t0_xsd_invalid(self, resolver: ErrorResolver) -> None:
        exc = T1RejectionError(step=1, reason="XSD KO")
        assert resolver.from_t1_exception(exc) == T0_XSD_INVALID

    def test_t1_rejection_step_2_maps_to_t0_embedded_fail(self, resolver: ErrorResolver) -> None:
        exc = T1RejectionError(step=2, reason="embedded KO")
        assert resolver.from_t1_exception(exc) == T0_EMBEDDED_FAIL

    def test_t1_rejection_step_3_maps_to_t1_engine_exception(
        self, resolver: ErrorResolver
    ) -> None:
        exc = T1RejectionError(step=3, reason="rdg KO")
        assert resolver.from_t1_exception(exc) == T1_ENGINE_EXCEPTION

    def test_specialist_parsing_error_maps_to_t1_engine_exception(
        self, resolver: ErrorResolver
    ) -> None:
        exc = SpecialistParsingError("bad json")
        assert resolver.from_t1_exception(exc) == T1_ENGINE_EXCEPTION

    def test_generic_exception_maps_to_t1_engine_exception(self, resolver: ErrorResolver) -> None:
        exc = RuntimeError("anything else")
        assert resolver.from_t1_exception(exc) == T1_ENGINE_EXCEPTION

    def test_evaluation_timeout_priority_over_evaluation_error(
        self, resolver: ErrorResolver
    ) -> None:
        # EvaluationTimeoutError extends EvaluationError; the resolver
        # MUST check the more specific subtype first.
        exc = EvaluationTimeoutError(run_id="x", timeout_seconds=1.0)
        assert isinstance(exc, EvaluationError)
        assert resolver.from_t1_exception(exc) == T1_TIMEOUT


class TestT0AgentMapping:
    def test_ingestor_xml_maps_to_t0_parse_error(self, resolver: ErrorResolver) -> None:
        assert resolver.from_t0_agent("ingestor_xml") == T0_PARSE_ERROR

    def test_dependency_maps_to_t0_embedded_fail(self, resolver: ErrorResolver) -> None:
        assert resolver.from_t0_agent("dependency") == T0_EMBEDDED_FAIL

    def test_temporal_maps_to_t0_embedded_fail(self, resolver: ErrorResolver) -> None:
        assert resolver.from_t0_agent("temporal") == T0_EMBEDDED_FAIL

    def test_unknown_agent_falls_back_to_t0_parse_error(self, resolver: ErrorResolver) -> None:
        # Defensive default — surfaces via log at the call site.
        assert resolver.from_t0_agent("unknown_agent_xyz") == T0_PARSE_ERROR


class TestDirectResolvers:
    def test_from_t0_xml_parse(self, resolver: ErrorResolver) -> None:
        assert resolver.from_t0_xml_parse() == T0_PARSE_ERROR

    def test_from_t0_xsd_invalid(self, resolver: ErrorResolver) -> None:
        assert resolver.from_t0_xsd_invalid() == T0_XSD_INVALID

    def test_from_t0_embedded_fail(self, resolver: ErrorResolver) -> None:
        assert resolver.from_t0_embedded_fail() == T0_EMBEDDED_FAIL

    def test_for_no_verdicts(self, resolver: ErrorResolver) -> None:
        assert resolver.for_no_verdicts() == T1_NO_VERDICTS


class TestPartialCatalogue:
    """When the loaded catalogue is missing a code (misconfiguration),
    the resolver MUST raise UnknownErrorCodeError instead of returning
    a code that would later trigger a Postgres FK 23503 at /finalize."""

    def test_missing_code_raises_at_resolution(self) -> None:
        partial = ErrorResolver.from_codes(frozenset({T0_PARSE_ERROR}))
        with pytest.raises(UnknownErrorCodeError):
            partial.from_t0_embedded_fail()
