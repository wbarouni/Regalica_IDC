# @regalica/chatbot-py

FastAPI service hosting the 5 probabilistic LLM agents (Orchestrator, Schema
Inferencer, Rule Learner, Investigator, Reporter) and the RAG pipeline
(Chunker → Embedder → Clusterer → Reranker).

## Dev

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
uv run pytest
```

See root `README.md` and `docs/architecture/00-master-document.md` for context.
