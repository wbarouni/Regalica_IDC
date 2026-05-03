"""Library specialists — JSON-contract agents introduced in C17a.

Each module exposes one BaseSpecialistAgent subclass that wires its
prompt to the orchestrator's `_invoke_specialist_json` runner. Payload
construction reads from the shared `_SpecialistContext` (current_run_id,
tenant_id, fail_context dict for per-call inputs).
"""
