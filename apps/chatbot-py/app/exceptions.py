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
