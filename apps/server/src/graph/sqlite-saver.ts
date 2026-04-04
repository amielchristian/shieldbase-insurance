import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  copyCheckpoint,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
} from "@langchain/langgraph";

type PendingWrite = [string, unknown];
type CheckpointPendingWrite = [string, ...PendingWrite];
type CheckpointListOptions = {
  limit?: number;
  before?: RunnableConfig;
  filter?: Record<string, any>;
};

type SqliteSaverOptions = {
  maxPerThread?: number | null;
};

export class SqliteSaver extends BaseCheckpointSaver {
  private readonly db: DatabaseSync;
  private readonly maxPerThread: number | null;

  constructor(dbPath: string, options: SqliteSaverOptions = {}) {
    super();
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        checkpoint TEXT NOT NULL,
        metadata TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      );
    `);

    this.db.exec(
      "CREATE INDEX IF NOT EXISTS checkpoints_by_thread ON checkpoints(thread_id, checkpoint_ns, checkpoint_id);"
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS writes_by_checkpoint ON writes(thread_id, checkpoint_ns, checkpoint_id);"
    );

    const max = options.maxPerThread ?? null;
    this.maxPerThread = typeof max === "number" && Number.isFinite(max) && max > 0 ? Math.floor(max) : null;
  }

  private checkpointNamespace(config: RunnableConfig): string {
    return (config.configurable?.checkpoint_ns as string | undefined) ?? "";
  }

  private checkpointIdFromConfig(config: RunnableConfig): string | undefined {
    return (config.configurable?.checkpoint_id as string | undefined) ?? undefined;
  }

  private requireThreadId(config: RunnableConfig): string {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (!threadId) {
      throw new Error('Missing required "thread_id" in RunnableConfig.configurable');
    }
    return threadId;
  }

  private async loadPendingWrites(args: {
    threadId: string;
    checkpointNs: string;
    checkpointId: string;
  }): Promise<CheckpointPendingWrite[]> {
    const rows = this.db
      .prepare(
        `
        SELECT task_id, channel, value
        FROM writes
        WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
        ORDER BY task_id ASC, idx ASC
      `
      )
      .all(args.threadId, args.checkpointNs, args.checkpointId) as Array<{
      task_id: string;
      channel: string;
      value: string;
    }>;

    const pendingWrites: CheckpointPendingWrite[] = [];
    for (const row of rows) {
      pendingWrites.push([row.task_id, row.channel, await this.serde.loadsTyped("json", row.value)]);
    }
    return pendingWrites;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = this.requireThreadId(config);
    const checkpointNs = this.checkpointNamespace(config);
    let checkpointId = this.checkpointIdFromConfig(config);

    if (!checkpointId) {
      const row = this.db
        .prepare(
          `
          SELECT checkpoint_id
          FROM checkpoints
          WHERE thread_id = ? AND checkpoint_ns = ?
          ORDER BY checkpoint_id DESC
          LIMIT 1
        `
        )
        .get(threadId, checkpointNs) as { checkpoint_id: string } | undefined;
      if (!row?.checkpoint_id) return undefined;
      checkpointId = row.checkpoint_id;
    }

    const saved = this.db
      .prepare(
        `
        SELECT checkpoint, metadata, parent_checkpoint_id
        FROM checkpoints
        WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
        LIMIT 1
      `
      )
      .get(threadId, checkpointNs, checkpointId) as
      | { checkpoint: string; metadata: string; parent_checkpoint_id: string | null }
      | undefined;

    if (!saved) return undefined;

    const checkpoint = await this.serde.loadsTyped("json", saved.checkpoint);
    const metadata = (await this.serde.loadsTyped("json", saved.metadata)) as CheckpointMetadata;
    const pendingWrites = await this.loadPendingWrites({ threadId, checkpointNs, checkpointId });

    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_id: checkpointId,
          checkpoint_ns: checkpointNs,
        },
      },
      checkpoint,
      metadata,
      pendingWrites,
    };

    if (saved.parent_checkpoint_id) {
      tuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: saved.parent_checkpoint_id,
        },
      };
    }

    return tuple;
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    const { before, limit, filter } = options ?? {};
    const configCheckpointNs = (config.configurable?.checkpoint_ns as string | undefined) ?? undefined;
    const configCheckpointId = (config.configurable?.checkpoint_id as string | undefined) ?? undefined;

    const threadIds =
      (config.configurable?.thread_id as string | undefined) != null
        ? [config.configurable?.thread_id as string]
        : (this.db
            .prepare("SELECT DISTINCT thread_id FROM checkpoints ORDER BY thread_id ASC")
            .all() as Array<{ thread_id: string }>).map((r) => r.thread_id);

    let remaining = typeof limit === "number" ? limit : undefined;

    for (const threadId of threadIds) {
      const namespaces = configCheckpointNs
        ? [configCheckpointNs]
        : (this.db
            .prepare(
              `
              SELECT DISTINCT checkpoint_ns
              FROM checkpoints
              WHERE thread_id = ?
              ORDER BY checkpoint_ns ASC
            `
            )
            .all(threadId) as Array<{ checkpoint_ns: string }>).map((r) => r.checkpoint_ns);

      for (const checkpointNs of namespaces) {
        const rows = this.db
          .prepare(
            `
            SELECT checkpoint_id, checkpoint, metadata, parent_checkpoint_id
            FROM checkpoints
            WHERE thread_id = ? AND checkpoint_ns = ?
            ORDER BY checkpoint_id DESC
          `
          )
          .all(threadId, checkpointNs) as Array<{
          checkpoint_id: string;
          checkpoint: string;
          metadata: string;
          parent_checkpoint_id: string | null;
        }>;

        for (const row of rows) {
          if (configCheckpointId && row.checkpoint_id !== configCheckpointId) continue;
          if (before?.configurable?.checkpoint_id && row.checkpoint_id >= (before.configurable.checkpoint_id as string)) {
            continue;
          }
          if (remaining != null) {
            if (remaining <= 0) return;
            remaining -= 1;
          }

          const metadata = (await this.serde.loadsTyped("json", row.metadata)) as Record<string, unknown>;
          if (filter && !Object.entries(filter).every(([k, v]) => metadata[k] === v)) continue;

          const checkpoint = await this.serde.loadsTyped("json", row.checkpoint);
          const pendingWrites = await this.loadPendingWrites({
            threadId,
            checkpointNs,
            checkpointId: row.checkpoint_id,
          });

          const tuple: CheckpointTuple = {
            config: {
              configurable: {
                thread_id: threadId,
                checkpoint_ns: checkpointNs,
                checkpoint_id: row.checkpoint_id,
              },
            },
            checkpoint,
            metadata: metadata as CheckpointMetadata,
            pendingWrites,
          };

          if (row.parent_checkpoint_id) {
            tuple.parentConfig = {
              configurable: {
                thread_id: threadId,
                checkpoint_ns: checkpointNs,
                checkpoint_id: row.parent_checkpoint_id,
              },
            };
          }

          yield tuple;
        }
      }
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, string | number>
  ): Promise<RunnableConfig> {
    const prepared = copyCheckpoint(checkpoint);
    const threadId = this.requireThreadId(config);
    const checkpointNs = this.checkpointNamespace(config);
    const parentCheckpointId = (config.configurable?.checkpoint_id as string | undefined) ?? null;

    const [[, serializedCheckpoint], [, serializedMetadata]] = await Promise.all([
      this.serde.dumpsTyped(prepared),
      this.serde.dumpsTyped(metadata),
    ]);

    this.db
      .prepare(
        `
        INSERT OR REPLACE INTO checkpoints
          (thread_id, checkpoint_ns, checkpoint_id, checkpoint, metadata, parent_checkpoint_id)
        VALUES
          (?, ?, ?, ?, ?, ?)
      `
      )
      .run(threadId, checkpointNs, prepared.id, serializedCheckpoint, serializedMetadata, parentCheckpointId);

    if (this.maxPerThread) {
      this.pruneThread({ threadId, checkpointNs, keep: this.maxPerThread });
    }

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: prepared.id,
      },
    };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = this.requireThreadId(config);
    const checkpointNs = this.checkpointNamespace(config);
    const checkpointId = (config.configurable?.checkpoint_id as string | undefined) ?? undefined;
    if (!checkpointId) throw new Error('Missing required "checkpoint_id" in RunnableConfig.configurable');

    const insert = this.db.prepare(
      `
      INSERT OR IGNORE INTO writes
        (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, value)
      VALUES
        (?, ?, ?, ?, ?, ?, ?)
    `
    );

    for (let idx = 0; idx < writes.length; idx += 1) {
      const [channel, value] = writes[idx]!;
      const [, serializedValue] = await this.serde.dumpsTyped(value);
      insert.run(threadId, checkpointNs, checkpointId, taskId, idx, channel, serializedValue);
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    this.db.prepare("DELETE FROM writes WHERE thread_id = ?").run(threadId);
    this.db.prepare("DELETE FROM checkpoints WHERE thread_id = ?").run(threadId);
  }

  private pruneThread(args: { threadId: string; checkpointNs: string; keep: number }) {
    const rows = this.db
      .prepare(
        `
        SELECT checkpoint_id
        FROM checkpoints
        WHERE thread_id = ? AND checkpoint_ns = ?
        ORDER BY checkpoint_id DESC
        LIMIT -1 OFFSET ?
      `
      )
      .all(args.threadId, args.checkpointNs, args.keep) as Array<{ checkpoint_id: string }>;

    for (const row of rows) {
      this.db
        .prepare(
          "DELETE FROM writes WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?"
        )
        .run(args.threadId, args.checkpointNs, row.checkpoint_id);
      this.db
        .prepare(
          "DELETE FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?"
        )
        .run(args.threadId, args.checkpointNs, row.checkpoint_id);
    }
  }
}
