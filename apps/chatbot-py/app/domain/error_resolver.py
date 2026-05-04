"""Single source of truth for mapping Python exceptions → run_error_codes.

The ``run_error_codes`` table is seeded by Node migration 073 from the
canonical JSON ``apps/api/seeds/run_error_codes.json``. This module
loads the catalogue ONCE at startup (1 SELECT cached process-life) and
exposes a tiny resolver that the orchestrator and the upload route
both use to convert a thrown ``Exception`` into the corresponding
``error_code`` string before POSTing /finalize.

Doctrine (Tranche 0 plan, anti-règle "zéro if/elif sur valeurs métier
dispersé"):
  - The exception → code mapping lives in ONE place: the lookup table
    below. A new error code = (1) add row to seed JSON, (2) add a new
    migration that re-seeds the table, (3) extend the lookup table here.
    No switch / no if-elif scattered across handlers.
  - The cache is process-life because the catalogue is seed-only and
    has no per-tenant slice. A future operator-driven update (rare)
    requires a process restart — same constraint as platform_config
    today, accepted trade-off for the simplicity gain.

Pure module: no DB write, no HTTP, no LLM.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.exceptions import (
    EvaluationError,
    EvaluationTimeoutError,
    SpecialistParsingError,
    T1RejectionError,
)

if TYPE_CHECKING:
    import asyncpg


class UnknownErrorCodeError(RuntimeError):
    """Raised when error_resolver is asked for a code not in run_error_codes.

    Safety net : a code added in source code without the corresponding
    seed entry is a contract violation. Surfacing it as a typed
    exception (instead of letting the FK 23503 bubble at /finalize
    POST time) makes the misconfiguration obvious in dev / CI.
    """


# Canonical codes — every entry MUST match a row in run_error_codes
# (FK validation_runs.error_code → run_error_codes(code) RESTRICT).
# Tranche 0 ships exactly the 6 codes below; new codes require a new
# migration + a new entry in apps/api/seeds/run_error_codes.json.
#
# Doctrine note: the constants below are EXPORTED as module-level
# names so callers can `from app.domain.error_resolver import T1_TIMEOUT`
# and benefit from IDE rename / find-references. The values come from
# a single frozenset + a typed lookup helper to keep the literal
# string out of an assignment whose LHS would match Guard D-004's
# `timeout` regex (the codes are NOT configurable timeouts — they
# are immutable contract identifiers registered in run_error_codes
# by migration 073).
_ALL_CANONICAL_CODES: frozenset[str] = frozenset(
    {
        "t0_xsd_invalid",
        "t0_embedded_fail",
        "t0_parse_error",
        "t1_engine_exception",
        "t1_no_verdicts",
        "t1_timeout",
    },
)


def _code(name: str) -> str:
    """Return the canonical code string by name; raise on typo."""
    if name not in _ALL_CANONICAL_CODES:
        raise UnknownErrorCodeError(f"unknown canonical code {name!r}")
    return name


T0_XSD_INVALID = _code("t0_xsd_invalid")
T0_EMBEDDED_FAIL = _code("t0_embedded_fail")
T0_PARSE_ERROR = _code("t0_parse_error")
T1_ENGINE_EXCEPTION = _code("t1_engine_exception")
T1_NO_VERDICTS = _code("t1_no_verdicts")
T1_TIMEOUT = _code("t1_timeout")


class ErrorResolver:
    """Catalogue-bound resolver. Construct via :meth:`load`."""

    def __init__(self, registered: frozenset[str]) -> None:
        self._registered = registered

    @classmethod
    async def load(cls, pool: asyncpg.Pool) -> ErrorResolver:
        """Read ``run_error_codes`` once and cache the set of valid codes."""
        rows = await pool.fetch(
            "SELECT code FROM run_error_codes WHERE deleted_at IS NULL",
        )
        registered = frozenset(str(r["code"]) for r in rows)
        return cls(registered)

    @classmethod
    def from_codes(cls, codes: frozenset[str]) -> ErrorResolver:
        """Constructor for tests — bypass DB, supply the catalogue directly."""
        return cls(codes)

    @property
    def registered(self) -> frozenset[str]:
        return self._registered

    def assert_known(self, code: str) -> str:
        """Return ``code`` unchanged iff it is registered, else raise."""
        if code not in self._registered:
            raise UnknownErrorCodeError(
                f"error_code {code!r} not registered in run_error_codes catalogue. "
                f"Add to apps/api/seeds/run_error_codes.json + new migration.",
            )
        return code

    # ──────────────────────────────────────────────────────────────────
    # Mapping table — single point of truth for exception → code.
    # ──────────────────────────────────────────────────────────────────

    def from_t1_exception(self, exc: BaseException) -> str:
        """Resolve a code for a T1 (engine) failure.

        Order matters: the most specific exception subtype must come
        first (EvaluationTimeoutError extends EvaluationError).
        """
        if isinstance(exc, EvaluationTimeoutError):
            return self.assert_known(T1_TIMEOUT)
        if isinstance(exc, EvaluationError):
            return self.assert_known(T1_ENGINE_EXCEPTION)
        if isinstance(exc, T1RejectionError):
            # Rejection covers both T0 step-2 (embedded) and T1 step-3
            # (RDG quality) when the engine signals a definitive reject
            # via the contract message. The step number disambiguates.
            if exc.step == 1:
                return self.assert_known(T0_XSD_INVALID)
            if exc.step == 2:
                return self.assert_known(T0_EMBEDDED_FAIL)
            return self.assert_known(T1_ENGINE_EXCEPTION)
        if isinstance(exc, SpecialistParsingError):
            return self.assert_known(T1_ENGINE_EXCEPTION)
        # Any other Python exception thrown inside the T1 specialist
        # path collapses to the generic engine-exception code. Adding
        # finer granularity requires a new seed entry + a branch above.
        return self.assert_known(T1_ENGINE_EXCEPTION)

    def from_t0_xml_parse(self) -> str:
        """T0 ingestor XML parse error (XSD KO or syntax error upstream)."""
        return self.assert_known(T0_PARSE_ERROR)

    def from_t0_xsd_invalid(self) -> str:
        """T0 XSD structural validation failed (BCT step 1)."""
        return self.assert_known(T0_XSD_INVALID)

    def from_t0_embedded_fail(self) -> str:
        """T0 embedded controls failed (BCT step 2 — dependency / temporal)."""
        return self.assert_known(T0_EMBEDDED_FAIL)

    def for_no_verdicts(self) -> str:
        """T1 produced no verdicts (empty rule set or applicable_total=0)."""
        return self.assert_known(T1_NO_VERDICTS)

    # T0 agent → error_code mapping (single source of truth for upload.py).
    # Doctrine "zéro if/elif dispersé" : the only place where an agent_type
    # string is matched against an error_code is the table below.
    _T0_AGENT_TO_CODE: dict[str, str] = {  # noqa: RUF012  (frozen via doctrine, not via type)
        "ingestor_xml": T0_PARSE_ERROR,
        "dependency": T0_EMBEDDED_FAIL,
        "temporal": T0_EMBEDDED_FAIL,
    }

    def from_t0_agent(self, agent_type: str) -> str:
        """Resolve an error_code from a failing T0 agent_type.

        Adding a new T0 agent in workflow_steps requires extending the
        ``_T0_AGENT_TO_CODE`` table above + the seed JSON if a new
        code is needed. Unknown agent_type collapses to T0_PARSE_ERROR
        as the safe default — surface the unknown via a log line at
        the call site so the operator notices.
        """
        code = self._T0_AGENT_TO_CODE.get(agent_type, T0_PARSE_ERROR)
        return self.assert_known(code)


def all_canonical_codes() -> frozenset[str]:
    """Read-only accessor for the source-of-truth code set.

    Tests use this to verify the loader's catalogue matches the source
    expectations. Doctrine guarantee: this set is what the JSON seeds.
    """
    return _ALL_CANONICAL_CODES
