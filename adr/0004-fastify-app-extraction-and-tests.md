# ADR 0004: Fastify app extraction and automated tests

## Status

Accepted

## Record

- **Date:** 2026-04-05
- **Commit:** `6b4fbe7` — feat: add tests

## Context

The server entrypoint coupled bootstrap with route registration, which made it awkward to spin up an in-process Fastify instance in tests. The graph, quote helpers, and RAG layer had grown enough that manual verification was no longer sufficient.

## Decision

- **Extract** the configurable Fastify application into [`apps/server/src/app.ts`](../apps/server/src/app.ts) (or equivalent module at this commit) so tests can `buildApp()` without listening on a port.
- **Add** automated tests (Vitest) covering HTTP behavior, graph invocation paths, quote utilities, and knowledge-base loading:
  - [`apps/server/src/app.test.ts`](../apps/server/src/app.test.ts)
  - [`apps/server/src/graph/chat-graph.test.ts`](../apps/server/src/graph/chat-graph.test.ts)
  - [`apps/server/src/quote/quote.test.ts`](../apps/server/src/quote/quote.test.ts)
  - [`apps/server/src/rag/knowledge-base.test.ts`](../apps/server/src/rag/knowledge-base.test.ts)

## Consequences

- Regressions in routing, quoting, and RAG wiring are caught in CI/local test runs.
- Future architectural changes should extend or add tests in the same spirit rather than only updating prose ADRs.

## Related

- ADR 0003 — graph under test is the hybrid RAG + quotation graph.
