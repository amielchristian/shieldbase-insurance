# ADR 0005: SQLite checkpoints and expanded quote lifecycle

## Status

Accepted

## Record

- **Date:** 2026-04-05
- **Commit:** `9b2eb60` — Add quote cancel and durable SQLite session checkpointing

## Context

In-memory checkpoints (ADR 0003) drop all session state on server restart. The product also needs explicit user-driven flows: cancel a quote, pause/resume drafts, handle stale drafts, structured edits, optional thread deletion, and a review step before validation in some paths.

## Decision

**Persistence**

- Prefer **`SqliteSaver`** ([`apps/server/src/graph/sqlite-saver.ts`](../apps/server/src/graph/sqlite-saver.ts)) backed by Node’s `node:sqlite`, with database path from env.
- **Fallback:** if `node:sqlite` is unavailable (older Node), use **`MemorySaver`** as before.
- Optional **`CHAT_CHECKPOINT_MAX_PER_THREAD`** prunes older checkpoints per `thread_id`.
- Default DB path **`CHAT_CHECKPOINT_DB_PATH`**: `./data/chat-checkpoints.sqlite` (see root README for env summary).

**Graph additions (nodes and terminal edges)**

New or emphasized nodes beyond ADR 0003 (names mirror [`chat-graph.ts`](../apps/server/src/graph/chat-graph.ts)):

| Node id | Role (summary) |
|---------|----------------|
| `quote_resume_missing` | Resume when required quote context is missing. |
| `quote_cancel_reset` | User cancel / reset path; ends turn at `END`. |
| `quote_pause_draft` | Pause with draft persistence semantics. |
| `quote_stale_pause` | Stale draft handling. |
| `quote_edit_dispatch` | Dispatch structured edits from user text. |
| `thread_delete` | Honor delete-data intent; may request thread deletion from the checkpointer after invoke. |
| `quote_review` | Review step before validation where applicable. |

**Invoke follow-up**

- When `state.deleteThreadRequested` is set, `invokeChatGraph` best-effort calls `checkpointer.deleteThread(sessionId)`.

## Consequences

- Sessions survive ordinary server restarts (same DB file and path).
- Graph visualization becomes significantly denser because routers can target many lifecycle nodes.
- Operational concern: backup/migration of the SQLite file if sessions matter in production.

## Related

- ADR 0003 — prior in-memory checkpoint and smaller node set.
- ADR 0006 — retrieval and wire `meta` (orthogonal to persistence).
