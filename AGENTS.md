# AGENTS.md

Operational guide for coding agents working on **ShieldBase Insurance**. Use this as a checklist; the code paths below are the source of truth.

## Repo map

| Area | Location |
|------|----------|
| HTTP API (routes, CORS, validation) | `apps/server/src/app.ts` |
| Process entry, `.env` load | `apps/server/src/index.ts` |
| LangGraph compile + `invokeChatGraph` | `apps/server/src/graph/chat-graph.ts` |
| Programmatic graph diagram HTML | `apps/server/src/graph/graph-diagram.ts` |
| Prompts & static welcome copy | `apps/server/src/prompts/chat.ts` |
| Chat request body schema | `apps/server/src/schemas/chat.ts` |
| Quote state machine & text helpers | `apps/server/src/quote/quote.ts` |
| RAG: chunks, keyword search | `apps/server/src/rag/knowledge-base.ts` |
| RAG: embeddings, cache, vector search | `apps/server/src/rag/vector-store.ts` |
| RAG: cosine gate + RRF merge | `apps/server/src/rag/hybrid-retrieval.ts` |
| OpenRouter clients | `apps/server/src/openrouter.ts` |
| Chat UI + API client | `apps/chat/src/components/chat-support.tsx`, `apps/chat/src/lib/chat-api.ts` |
| Markdown KB on disk | `knowledge-base/*.md` (repo root) |
| Architecture timeline | `adr/README.md`, `adr/0001-*.md` … |

## Commands (verify before you finish)

From repo root:

```bash
pnpm exec turbo run check-types --filter=server --filter=chat
pnpm exec turbo run test --filter=server
```

From `apps/server` only:

```bash
pnpm check-types && pnpm test
```

## HTTP contracts (do not drift silently)

- **`GET /api/chat/welcome`** — Returns `{ role: "assistant", content }` from `CHAT_WELCOME_MESSAGE` in `prompts/chat.ts`. Not LLM-generated.
- **`POST /api/chat`** — Body: `chatBodySchema` in `schemas/chat.ts`: `messages` (each `role`: `user` \| `assistant` only), optional `sessionId`. Server assigns `randomUUID()` if `sessionId` omitted (`app.ts`).
- **`POST /api/chat/quote/clear`** — `{ sessionId }`; uses `compiledChatGraph.updateState` to reset quote-related channels (`app.ts`). Response `meta` must stay consistent with other chat responses (`quote: null`, `retrieval: null` where applicable).
- **`GET /api/graph/diagram`** — HTML from `getChatGraphDiagramHtml()` → `compiledChatGraph.getGraphAsync()` + `drawMermaid()`.

If you add fields to `ChatResponse` / `meta`, update **`apps/chat/src/lib/chat-api.ts`**, **`chat-support.tsx`**, and **`app.test.ts`** expectations.

## When you change the LangGraph (`chat-graph.ts`)

1. **Trace routing:** `intent_router` → conditional `state.next` → downstream nodes. New nodes need `addNode`, edges, and valid `NextNode` / route types.
2. **Quote vs RAG:** Idle routing is mostly **rule-based** in `intent_router`; with an **active** quote, **`quote_intent_classify`** uses structured LLM output — adjust prompts in `prompts/chat.ts` if you change labels or behavior.
3. **Stale `retrieval`:** If a turn does not run `rag_retrieve`, ensure returned **`meta.retrieval`** still makes sense (pattern elsewhere: clear `retrieval` when entering non-RAG paths).
4. **Diagram:** After topology changes, open **`/api/graph/diagram`** locally; Mermaid is generated from the compiled graph, not hand-drawn.
5. **ADRs:** Do not rewrite past ADRs for new behavior — add **`adr/0007-…md`** and update **`adr/README.md`**.

## When you change RAG

1. **Chunk source:** `loadKnowledgeBaseChunks()` resolves KB as `join(process.cwd(), "..", "..", "knowledge-base")` — assumes **cwd is `apps/server`** (typical for `pnpm --filter server dev`). If KB fails to load, confirm how the process was started.
2. **Hybrid path:** `hybrid-retrieval.ts` (RRF, cosine floor envs), `vector-store.ts` (embed title+body, disk cache). Env names live in root **`README.md`** (`RAG_*`).
3. **Tests:** Extend `hybrid-retrieval.test.ts` for pure merge/threshold logic; use mocked OpenRouter in graph tests for end-to-end shape.

## When you change the chat client

1. **Suggestions / copy:** Quick actions must match topics present in **`knowledge-base/*.md`** and flows the graph actually supports (see README “ShieldBase chat environment”).
2. **Welcome:** Loaded via `fetchWelcomeMessage()` → `/api/chat/welcome`; keep loading/error UX in sync if routes change.

## When you change prompts

- Edit **`apps/server/src/prompts/chat.ts`** only for global instruction/welcome/classifier copy unless you have a strong reason to split files.
- Never accept **`system`** role from clients — enforced in `chatMessageSchema`.

## Environment

- **`.env`:** Loaded in `index.ts` with `dotenv.config({ path: …/apps/server/.env })` — keys must live there for local dev.
- **Checkpointer:** SQLite via `node:sqlite` when available; otherwise in-memory. See README for `CHAT_CHECKPOINT_*` and `QUOTE_DRAFT_TTL_MINUTES`.

## Testing expectations

- **`chat-graph.test.ts`:** `vi.mock("../openrouter.js", …)` **before** importing the graph module — no real OpenRouter calls. Assertions should target **routing, state, and response shape**, not model prose.
- **HTTP:** `app.test.ts` uses `buildServer({ logger: false })` and temp SQLite paths via env — follow the same pattern for new routes.

## Git & scope

- **Ask before committing** unless the user explicitly wants a commit.
- Keep diffs **scoped** to the requested behavior; avoid drive-by refactors and unrelated markdown.
