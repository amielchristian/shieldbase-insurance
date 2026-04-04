import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createOpenRouterEmbeddings, getOpenRouterEmbeddingsModelName } from "../openrouter.js";
import type { KnowledgeChunk } from "./knowledge-base.js";

export type RetrievedChunk = KnowledgeChunk & { score: number };

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const denom = norm(a) * norm(b);
  if (!denom) return 0;
  return dot(a, b) / denom;
}

type IndexEntry = {
  chunk: KnowledgeChunk;
  embedding: number[];
};

function chunkEmbeddingText(chunk: KnowledgeChunk): string {
  return `${chunk.title}\n\n${chunk.content}`.trim();
}

type EmbeddingCacheFileV1 = {
  version: 1;
  model: string;
  kbKey: string;
  chunkIds: string[];
  embeddings: number[][];
};

function defaultEmbeddingCacheDir(): string {
  const override = process.env.RAG_EMBEDDING_CACHE_DIR?.trim();
  if (override) return override;
  return join(homedir(), ".cache", "shieldbase-rag");
}

function cacheFilePath(kbKey: string, model: string): string {
  const dir = defaultEmbeddingCacheDir();
  const safe = createHash("sha256").update(model).update("\0").update(kbKey).digest("hex").slice(0, 24);
  return join(dir, `embeddings-${safe}.json`);
}

async function tryLoadEmbeddingCache(
  chunks: KnowledgeChunk[],
  kbKey: string,
  model: string
): Promise<number[][] | null> {
  const filePath = cacheFilePath(kbKey, model);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as EmbeddingCacheFileV1;
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as EmbeddingCacheFileV1).version !== 1 ||
    (parsed as EmbeddingCacheFileV1).model !== model ||
    (parsed as EmbeddingCacheFileV1).kbKey !== kbKey
  ) {
    return null;
  }
  const data = parsed as EmbeddingCacheFileV1;
  const expectedIds = chunks.map((c) => c.id);
  if (
    !Array.isArray(data.embeddings) ||
    !Array.isArray(data.chunkIds) ||
    data.embeddings.length !== chunks.length ||
    data.chunkIds.length !== expectedIds.length
  ) {
    return null;
  }
  for (let i = 0; i < expectedIds.length; i += 1) {
    if (data.chunkIds[i] !== expectedIds[i]) return null;
    const row = data.embeddings[i];
    if (!Array.isArray(row) || row.length === 0) return null;
  }
  return data.embeddings as number[][];
}

async function saveEmbeddingCache(
  chunks: KnowledgeChunk[],
  kbKey: string,
  model: string,
  embeddings: number[][]
): Promise<void> {
  const dir = defaultEmbeddingCacheDir();
  await mkdir(dir, { recursive: true });
  const payload: EmbeddingCacheFileV1 = {
    version: 1,
    model,
    kbKey,
    chunkIds: chunks.map((c) => c.id),
    embeddings,
  };
  const filePath = cacheFilePath(kbKey, model);
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(payload), "utf8");
  await rename(tmp, filePath);
}

export class InMemoryVectorStore {
  private entries: IndexEntry[] = [];

  static async build(chunks: KnowledgeChunk[]) {
    const model = getOpenRouterEmbeddingsModelName();
    const kbKey = getKnowledgeBaseCacheKey(chunks);
    const cached = await tryLoadEmbeddingCache(chunks, kbKey, model);

    const embeddings = createOpenRouterEmbeddings();
    const texts = chunks.map((c) => chunkEmbeddingText(c));
    const vectors =
      cached ??
      (await embeddings.embedDocuments(texts)).map((v) => v as number[]);

    if (!cached && vectors.length === chunks.length) {
      try {
        await saveEmbeddingCache(chunks, kbKey, model, vectors);
      } catch {
        // Cache is optional; retrieval still works without it.
      }
    }

    const store = new InMemoryVectorStore();
    store.entries = chunks.map((chunk, idx) => ({
      chunk,
      embedding: vectors[idx] as number[],
    }));
    return store;
  }

  async search(query: string, k: number): Promise<RetrievedChunk[]> {
    const embeddings = createOpenRouterEmbeddings();
    const q = (await embeddings.embedQuery(query)) as number[];
    const scored = this.entries
      .map((e) => ({
        ...e.chunk,
        score: cosineSimilarity(q, e.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    return scored;
  }
}

export function getKnowledgeBaseCacheKey(chunks: KnowledgeChunk[]): string {
  // Best-effort: changes when chunk content changes.
  const h = createHash("sha256");
  for (const c of chunks) h.update(c.id).update("\0").update(c.content).update("\0");
  return h.digest("hex").slice(0, 16);
}
