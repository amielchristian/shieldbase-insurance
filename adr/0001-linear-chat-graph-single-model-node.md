# ADR 0001: Linear LangGraph chat (single `model` node)

## Status

Accepted

## Record

- **Date:** 2026-04-05
- **Commit:** `177ba64` — docs: add ADR 1

## Context

The server needed a minimal orchestration boundary around the LLM: one turn in, one assistant message out, with OpenRouter as the chat backend. HTTP and the React client should stay thin; the graph owns invocation.

## Decision

Use a **`StateGraph`** on LangGraph’s **`MessagesAnnotation`**: a single node, `model`, that reads `state.messages`, calls `ChatOpenAI.invoke`, and returns the new `AIMessage` so the reducer appends it.

- **Graph:** [`apps/server/src/graph/chat-graph.ts`](../apps/server/src/graph/chat-graph.ts) — `invokeChatGraph(messages: WireChatMessage[])` (no `sessionId` yet).
- **System prompt:** [`apps/server/src/prompts/chat.ts`](../apps/server/src/prompts/chat.ts) — `CHAT_SYSTEM_PROMPT` prepended in `invokeChatGraph` before `graph.invoke`, not inside the node.
- **Edges:** `START → model → END`.
- **Extraction:** after `invoke`, the last message with `getType() === "ai"` becomes the HTTP response body (string content).

Explicit **non-goals** for this snapshot: no checkpointer, no branching routers, no interrupts, no tool nodes, no streaming.

## Consequences

- Simple mental model and trivial graph shape.
- No cross-turn server-side state in the graph; each request is a full `invoke` over assembled messages.
- Any branching, RAG, quotation flow, or persistence requires a **new** ADR and graph shape (see ADR 0003).

## Supersedes

— (first in series)

## Superseded by (orchestration shape)

ADR 0003 replaces this linear graph with a routed hybrid graph. ADR 0002 adds only an HTTP diagram surface and does not change runtime topology.
