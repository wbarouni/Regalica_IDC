# @regalica/rdg-schema

**Status:** Placeholder — implemented in Phase 1.

## Purpose

Hosts the canonical AST DSL that expresses the 4 611 RDG rules of the BCT
reporting referential. Implemented as:

- **Zod** schemas in this package (`src/`), consumed by `@regalica/api` and
  `@regalica/frontend`
- **Pydantic** mirror in `apps/chatbot-py/app/rdg/` (same shape, same field
  names), consumed by the 5 LLM agents and the RAG pipeline

The two implementations must stay in lock-step — any change to the DSL lands
in both packages in the same PR.

## Why two implementations?

Pillar 2 (ZERO HARDCODING) forbids parsing rules in business code. Every
consumer must validate every rule against the schema at load time. Node and
Python services cannot share one schema library, so we mirror instead.

See `docs/architecture/00-master-document.md` §9 for rule semantics and §9.4
for the evaluation algorithm.
