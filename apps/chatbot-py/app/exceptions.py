"""Domain exceptions raised across the chatbot-py services.

Each exception name carries its semantic so callers do not need to
inspect the message to branch — `except SpecialistParsingError:` and
similar `except` blocks handle the recovery path.
"""

from __future__ import annotations


class SpecialistParsingError(Exception):
    """Raised when a JSON-contract specialist returns an output that
    cannot be parsed as a JSON object even after one corrective retry.

    The orchestrator must catch this and degrade gracefully — typically
    by surfacing the offending agent's bearer label in the user-facing
    response and continuing with the remaining specialists' outputs.
    """


class EvaluationError(Exception):
    """Raised when the /api/engine/runs/:runId/evaluate route returns
    a non-2xx HTTP response. Carries the upstream `status_code` so the
    caller can branch on auth failures (401/403), missing data (404),
    or engine errors (500) without parsing the message string.
    """

    def __init__(self, message: str, status_code: int | None = None) -> None:
        self.status_code = status_code
        super().__init__(message)


class EvaluationTimeoutError(EvaluationError):
    """Raised when the evaluate route does not respond within the
    caller-supplied timeout. Subclass of EvaluationError so a single
    `except EvaluationError` block can swallow both the HTTP error and
    the timeout path; tests that specifically need the timeout case
    catch the subclass.
    """

    def __init__(self, run_id: str, timeout_seconds: float) -> None:
        super().__init__(
            f"evaluate_run timeout après {timeout_seconds}s pour run {run_id}",
            status_code=None,
        )
        self.run_id = run_id
        self.timeout_seconds = timeout_seconds
