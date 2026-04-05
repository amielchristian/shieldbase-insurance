# ADR 0002: HTTP graph diagram (Mermaid)

## Status

Accepted

## Record

- **Date:** 2026-04-05
- **Commit:** `2a2171b` — feat: add endpoint for displaying graph visualization

## Context

Operators and developers need to see the compiled LangGraph structure without reading source. LangGraph exposes a drawable graph API and Mermaid output.

## Decision

Add a programmatic diagram pipeline: resolve the compiled graph, call `Graph.drawMermaid()` from `@langchain/core`, wrap in HTML, and serve it at **`GET /api/graph/diagram`**.

- **Implementation:** [`apps/server/src/graph/graph-diagram.ts`](../apps/server/src/graph/graph-diagram.ts) (uses `compiledChatGraph.getGraphAsync()` from [`chat-graph.ts`](../apps/server/src/graph/chat-graph.ts)).
- **Fastify:** register the route alongside existing API routes (see server entry at the time of this commit).

## Consequences

- Diagram updates track code changes automatically; narrative docs do not need hand-drawn edge lists for every rename.
- The endpoint is auxiliary to chat behavior and does not change invoke semantics.

## Related

- ADR 0001 — graph topology at introduction of this feature was still the single `model` node.
- ADR 0003 — hybrid graph makes the diagram materially more complex.
