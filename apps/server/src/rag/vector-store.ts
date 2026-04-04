import { createHash } from "node:crypto";
import { createOpenRouterEmbeddings } from "../openrouter.js";
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

export class InMemoryVectorStore {
  private entries: IndexEntry[] = [];

  static async build(chunks: KnowledgeChunk[]) {
    const embeddings = createOpenRouterEmbeddings();
    const texts = chunks.map((c) => c.content);
    const vectors = await embeddings.embedDocuments(texts);
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

