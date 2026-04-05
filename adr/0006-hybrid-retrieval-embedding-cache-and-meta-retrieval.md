# ADR 0006: Hybrid retrieval, embedding cache, and `meta.retrieval`

## Status

Accepted

## Record

- **Date:** 2026-04-05
- **Commit:** `1a464e4` — feat(rag): hybrid retrieval, embedding cache, and source meta

## Context

Keyword-only or naive dense retrieval was either brittle or expensive to rebuild on every cold start. Operators also need transparency about which KB sources grounded a RAG answer without putting full excerpt text on the wire.

## Decision

**Retrieval (`rag_retrieve` behavior)**

- **Dense:** embeddings over chunk title + body via OpenRouter; apply a **minimum cosine similarity** gate before merging.
- **Sparse:** keyword search over the same chunk set.
- **Merge:** **reciprocal rank fusion (RRF)** between dense and keyword rankings (tunable constant).
- If the vector index cannot be built, fall back to **keyword-only** behavior.

**Caching**

- Chunk embeddings may be loaded from a disk cache under **`RAG_EMBEDDING_CACHE_DIR`** (default under user cache; see README). Clearing the cache forces rebuild after KB edits.

**Configuration (env)**

- `RAG_MIN_COSINE_SIMILARITY` — cosine floor for dense side (default in code/README).
- `RAG_RRF_K` — RRF parameter (default `60`).

**Wire contract**

- When RAG retrieval runs, the HTTP response **`meta.retrieval`** lists KB source **titles, paths, and scores** for the turn. Excerpt text is **not** included in the payload.

## Consequences

- Better relevance when hybrid merge is active; tunable thresholds without code changes.
- Clients can show “sources used” UI from `meta.retrieval`.
- Cache directory hygiene becomes part of KB update workflow.

## Related

- ADR 0003 / 0005 — graph topology; this ADR narrows how `rag_retrieve` is implemented and what the API exposes.
