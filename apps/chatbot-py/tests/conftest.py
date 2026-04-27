"""Pytest conftest — inject required LLM env vars before app imports.

apps/chatbot-py/app/config.py instantiates Settings() at module load, and
the LLM fields (LLM_PROVIDER, GEMINI_MODEL, GEMINI_THINKING_BUDGET,
OLLAMA_URL, OLLAMA_MODEL, EMBEDDING_PROVIDER, EMBEDDING_MODEL) are
required with no defaults (per the zero-hardcoding doctrine,
docs/03 Niveau 3). Without values in the process environment, any
`from app.main import app` in a test would raise a pydantic
ValidationError during collection.

Pytest discovers conftest.py BEFORE importing any test module, so setting
os.environ at module level here happens before test files run their
imports. os.environ.setdefault is used so that a real CI env which
already exports these values is respected and not overwritten.
"""

from __future__ import annotations

import os

_TEST_ENV_DEFAULTS: dict[str, str] = {
    "LLM_PROVIDER": "gemini",
    "GEMINI_MODEL": "gemini-2.5-flash",
    "GEMINI_THINKING_BUDGET": "8192",
    "OLLAMA_URL": "http://ollama:11434",
    "OLLAMA_MODEL": "qwen2.5:3b",
    "EMBEDDING_PROVIDER": "gemini",
    "EMBEDDING_MODEL": "text-embedding-004",
}

for _name, _value in _TEST_ENV_DEFAULTS.items():
    os.environ.setdefault(_name, _value)
