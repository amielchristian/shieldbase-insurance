# ADR 0001: LangGraph chat graph (canonical record)

## Status

Accepted

## Context

This ADR is the **primary artifact** we keep current as the product evolves. The **compiled LangGraph** in `apps/server/src/graph/chat-graph.ts` is the source of truth for how a chat turn is orchestrated. HTTP (Fastify), the React client, and shared packages are **auxiliary**: they deliver bytes to and from the graph but do not define orchestration logic.

This project implements a **hybrid chatbot**:

- **Conversational mode (RAG):** answers are grounded in the repo’s `knowledge-base/*.md`.
- **Transactional mode (quotation flow):** a structured, validated workflow for auto/home/life quotes.
- **Graceful transitions:** while quoting, users can ask KB questions and then continue without losing collected fields.
- **Stateful sessions:** a `sessionId` maps to LangGraph `thread_id` and persists state in-memory via `MemorySaver`.

---

## Canonical implementation

| Item | Location |
|------|----------|
| Graph definition + compile + `invokeChatGraph` | [`apps/server/src/graph/chat-graph.ts`](../apps/server/src/graph/chat-graph.ts) — exports `compiledChatGraph` |
| Programmatic Mermaid + HTML wrapper | [`apps/server/src/graph/graph-diagram.ts`](../apps/server/src/graph/graph-diagram.ts) — `compiledChatGraph.getGraphAsync()` then `Graph.drawMermaid()` from `@langchain/core`; served at `GET /api/graph/diagram` |
| Prompt copy | [`apps/server/src/prompts/chat.ts`](../apps/server/src/prompts/chat.ts) — `CHAT_SYSTEM_PROMPT`, `RAG_SYSTEM_PROMPT` |

---

## Graph topology

The runtime object is a **`StateGraph`** built on a custom **`Annotation.Root`** state definition.

**Persistence**

- The compiled graph is created with a **`MemorySaver` checkpointer**.
- Each request passes `configurable.thread_id = sessionId`, making state persistent across turns (until server restart).

**State channels (conceptual)**

- `messages`: LangChain messages (Human/AI) with `messagesStateReducer` (append semantics).
- `mode`: `"conversational" | "quotation"`.
- `route`: router output for the current turn (`rag | quote | quote_side_question | quote_topic_shift | restart`).
- `retrieval`: last retrieved KB chunks (for grounding).
- `quote`: structured quote state: `{ active, product, step, data, lastQuote }`.

**Nodes**

| Node id | Responsibility |
|---------|----------------|
| `intent_router` | Detect intent for the current user message and set `state.route`. |
| `quote_intent_classify` | During an active quote, classifies if the user should continue quote collection, ask a side question, or shift topics. |
| `rag_retrieve` | Retrieve top-K KB chunks: dense search over title+body embeddings (OpenRouter), cosine floor + reciprocal-rank fusion with keyword search, or keyword-only if the vector index cannot be built. Chunk embeddings may be loaded from a disk cache under `RAG_EMBEDDING_CACHE_DIR` (see README). |
| `rag_answer` | Call the LLM with KB excerpts and emit one assistant message (also appends resume guidance when handling quote side questions/topic shifts). |
| `quote_entry` | Enter the quote lane and dispatch to the correct quote step (based on `quote.step`, with restart handling). |
| `quote_identify_product` | Determine product type or ask the user to pick auto/home/life. |
| `quote_collect_details` | Extract/collect fields, ask the next missing field, or advance to validation. |
| `quote_validate` | Validate inputs (Zod); ask for corrections or advance to generation. |
| `quote_generate` | Compute deterministic dummy quote + breakdown and present it. |
| `quote_confirm` | Handle accept/adjust/start-over/switch-product. |

**Edges**

High-level flow:

- `START -> intent_router`
- Conditional:
  - `rag`, `quote_side_question`, and `quote_topic_shift`: `rag_retrieve -> rag_answer -> END`
  - `quote` and `restart`: `quote_entry -> (quote step nodes) -> END`

**Lifecycle**

- The graph is **compiled once** at module load (`const graph = ... .compile()`).
- Each HTTP chat request calls **`invokeChatGraph({ sessionId, messages })`** and runs **`graph.invoke({ messages })`** with `thread_id = sessionId`.

OpenRouter is reached via `configuration.baseURL` = `https://openrouter.ai/api/v1` and `OPENROUTER_API_KEY`. Optional headers: `HTTP-Referer`, `X-Title` from env.

---

## Message assembly and extraction (invoke boundary)

Wire format from the HTTP layer includes a `sessionId` plus a list of new messages:

- Request: `{ sessionId?: string, messages: { role: "user" | "assistant", content: string }[] }`
- The server treats the graph as **stateful**: the client should send **new messages for the turn**, not the full history.

System prompts are not stored in `state.messages`. Nodes that call the LLM assemble prompts internally (see `rag_answer` in `apps/server/src/graph/chat-graph.ts`).

### Extraction rule

After `invoke`, the HTTP layer uses the **last message** in final state whose `getType() === "ai"` and normalizes `content` to a string (`toStringContent`). If none is found, throw. `meta.retrieval` lists KB source titles, paths, and scores for the current turn when RAG retrieval ran (no excerpt text in the wire payload).

---

## State shape (conceptual)

See “State channels” above. The key point: `quote` and `retrieval` are first-class state channels, not inferred from the text history.

---

## Auxiliary systems (not the tracking focus)

Keep these minimal in documentation; update only when they affect **how** the graph is invoked or configured.

| Area | Role relative to the graph |
|------|----------------------------|
| **Fastify** (`apps/server/src/index.ts`) | Validates body, calls `invokeChatGraph`, maps errors to HTTP; graph viz at `GET /api/graph/diagram` (HTML), using LangGraph’s drawable graph API. |
| **Zod** (`apps/server/src/schemas/chat.ts`) | Ensures wire roles are only `user` / `assistant` (no client `system`). |
| **Welcome endpoint** | `GET /api/chat/welcome` serves static copy; **does not** run the graph. |
| **Client** (`apps/chat`) | Fetches welcome, stores `sessionId` in `localStorage`, posts **new turn messages** to `POST /api/chat`; dev Vite proxy forwards `/api` to the server. |
| **Monorepo** | pnpm workspaces + Turbo; graph code lives under `apps/server`. |

---

## Evolution checklist (when you change the graph)

Update **this ADR** when you:

- Add/remove/rename nodes or edges (Mermaid from `drawMermaid` updates automatically; refresh narrative diagrams in this ADR if you keep them).
- Change state annotation or reducers.
- Move system prompt injection (e.g. into a dedicated node).
- Add tools, retrieval, branching, persistence, or streaming.
- Change OpenRouter/model configuration ownership (env vs graph vs node).

---

## Related documentation

- Root [`README.md`](../README.md) — env vars and dev proxy (auxiliary).
- [`adr/README.md`](README.md) — ADR index.
