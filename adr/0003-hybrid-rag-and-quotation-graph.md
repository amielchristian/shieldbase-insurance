# ADR 0003: Hybrid RAG + quotation `StateGraph`

## Status

Accepted

## Record

- **Date:** 2026-04-05
- **Commit:** `8d94ebb` — feat: implement RAG and graph

## Context

The product needs both **KB-grounded answers** and a **structured quote flow** (auto / home / life), with graceful handling when the user asks a side question during an active quote. Sessions must persist across HTTP requests within a server process.

## Decision

Replace the linear `MessagesAnnotation` graph with a custom **`Annotation.Root`** state graph compiled with a **`MemorySaver`** checkpointer.

**Hybrid behavior**

- **Conversational (RAG):** retrieve from `knowledge-base/*.md`, answer with `RAG_SYSTEM_PROMPT` and citations in state.
- **Quotation:** steps driven by structured `quote` state (`active`, `product`, `step`, `data`, `lastQuote`, etc.) and Zod validation at the right step.
- **Active-quote interrupts:** `quote_intent_classify` chooses between continuing the quote, a KB side question, or a topic shift; RAG path still ends with guidance to resume quoting.

**Persistence**

- `configurable.thread_id = sessionId` on each `invoke`; checkpoints live in memory until process exit.

**State channels (conceptual)**

- `messages` — append via `messagesStateReducer`.
- `mode` — `"conversational" | "quotation"`.
- `route` — e.g. `rag | quote | quote_side_question | quote_topic_shift | restart`.
- `retrieval` — last retrieved KB chunks for grounding.
- `quote` — structured quote state.

**Nodes (as of this commit)**

| Node id | Responsibility |
|---------|----------------|
| `intent_router` | Set `route` / `next` for the turn. |
| `quote_intent_classify` | During an active quote, classify continue vs side question vs topic shift. |
| `rag_retrieve` | Top-K chunk retrieval (embedding-backed store when available; keyword fallback). |
| `rag_answer` | LLM turn with excerpts; resume guidance when returning from side question / shift. |
| `quote_entry` | Enter quote lane; dispatch by `quote.step` and restart handling. |
| `quote_identify_product` | Resolve or ask product type. |
| `quote_collect_details` | Collect / extract fields; advance toward validation. |
| `quote_validate` | Zod validation; corrections or advance. |
| `quote_generate` | Deterministic dummy quote + breakdown. |
| `quote_confirm` | Accept / adjust / start over / switch product. |

**Edges (high level)**

- `START → intent_router` → conditional `next`.
- RAG paths: `rag_retrieve → rag_answer → END` (and analogous routes for quote side question / topic shift).
- Quote paths: `quote_entry` → step nodes → `END` as implemented in code.

**Invoke boundary**

- Request includes `sessionId` and **new** turn messages only (stateful thread).
- System prompts are assembled inside nodes that call the LLM, not prepended only at the HTTP boundary.

OpenRouter: `configuration.baseURL` = `https://openrouter.ai/api/v1`, `OPENROUTER_API_KEY`; optional `HTTP-Referer` / `X-Title`.

## Consequences

- Substantially richer behavior at the cost of graph complexity and more test surface area.
- In-memory checkpoints are lost on restart; durability is addressed later (ADR 0005).

## Supersedes

ADR 0001’s single-node orchestration model.

## Related

- ADR 0002 — diagram endpoint reflects this (denser) graph.
- ADR 0004 — Fastify `app` extraction and automated tests.
- ADR 0005 — SQLite checkpoints and additional quote-lifecycle nodes.
- ADR 0006 — hybrid retrieval and `meta.retrieval` on the wire.
