# Architecture Decision Records (ADR)

This folder records **architecture decisions as an append-only timeline**. Each numbered file is a **snapshot tied to a point in repo history** (see **Record** in each ADR): we **add** a new ADR when the architecture meaningfully changes, instead of rewriting one “living” overview.

**Source of truth:** the codebase (especially [`apps/server/src/graph/chat-graph.ts`](../apps/server/src/graph/chat-graph.ts)) remains authoritative for current behavior. ADRs explain **what we decided and when**, so `git log -- adr/` reads as a sequence of documented milestones.

## Index

| ID | Title | Status |
|----|--------|--------|
| [0001](0001-linear-chat-graph-single-model-node.md) | Linear LangGraph chat (single `model` node) | Accepted |
| [0002](0002-graph-diagram-endpoint.md) | HTTP graph diagram (Mermaid) | Accepted |
| [0003](0003-hybrid-rag-and-quotation-graph.md) | Hybrid RAG + quotation `StateGraph` | Accepted |
| [0004](0004-fastify-app-extraction-and-tests.md) | Fastify app extraction and automated tests | Accepted |
| [0005](0005-sqlite-checkpoints-and-quote-lifecycle-nodes.md) | SQLite checkpoints and expanded quote lifecycle | Accepted |
| [0006](0006-hybrid-retrieval-embedding-cache-and-meta-retrieval.md) | Hybrid retrieval, embedding cache, and `meta.retrieval` | Accepted |

## Conventions

- Files are numbered sequentially: `NNNN-short-title.md`.
- Prefer **Context → Decision → Consequences**, plus a **Record** block (date + primary commit) when the decision maps to a merge or feature commit.
- **Do not** fold new architecture into an old ADR; add **0007**, **0008**, … instead. Typos or clarifications in an existing ADR are fine if they do not change the recorded decision.
- Update this index table when adding an ADR.
