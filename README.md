## ShieldBase Insurance Chatbot

Insurance assistant built with Fastify + LangGraph:

- Conversational Q&A over a ShieldBase knowledge base (RAG).
- Guided transactional quote workflow (auto, home, life).

## Setup

### 1) Prerequisites

- Node.js `>= 18`
- `pnpm` `9.x`

### 2) Install dependencies

From the repository root:

```bash
pnpm install
```

### 3) Configure environment variables

The server reads env vars from `apps/server/.env`.

1. Copy the template:

```bash
cp apps/server/.env.example apps/server/.env
```

2. Set at least:
   - `OPENROUTER_API_KEY` (required)

3. Optional OpenRouter settings:
   - `OPENROUTER_MODEL` (default: `openai/gpt-4o-mini`)
   - `OPENROUTER_EMBEDDINGS_MODEL` (default: `text-embedding-3-small`)
   - `OPENROUTER_HTTP_REFERER`
   - `OPENROUTER_APP_NAME`

4. Optional server/session settings:
   - `PORT` (default: `3001`)
   - `HOST` (default: `0.0.0.0`)
   - `CHAT_CHECKPOINT_DB_PATH` (default: `./data/chat-checkpoints.sqlite`)
   - `CHAT_CHECKPOINT_MAX_PER_THREAD`
   - `QUOTE_DRAFT_TTL_MINUTES` (default: `60`)

5. Optional RAG tuning:
   - `RAG_MIN_COSINE_SIMILARITY` (default: `0.25`)
   - `RAG_RRF_K` (default: `60`)
   - `RAG_EMBEDDING_CACHE_DIR` (default: `~/.cache/shieldbase-rag`)

Note: `node:sqlite` is experimental in Node and may show an ExperimentalWarning. If unavailable, the server falls back to an in-memory checkpointer.

### 4) Run the app

From the repository root:

```bash
pnpm dev
```

By default:

- Server API runs at `http://localhost:3001`
- Marketing app runs with Vite (port shown in terminal)
- Widget demo runs with Vite (port shown in terminal)
- Chat demo is deprecated, but can be run with Vite (port shown in terminal)

### 5) Useful API routes

- `GET /api/chat/welcome` - returns the static first assistant message.
- `POST /api/chat` - returns `{ content, meta, sessionId }`.
- `POST /api/chat/quote/clear` - clears the active quote draft for a `sessionId`.
- `GET /api/graph/diagram` - renders the compiled LangGraph as Mermaid HTML.

### 6) Verify before shipping changes

From the repository root:

```bash
pnpm exec turbo run check-types --filter=server --filter=chat
pnpm exec turbo run test --filter=server
```
