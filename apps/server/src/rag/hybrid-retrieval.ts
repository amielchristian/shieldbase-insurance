import type { KnowledgeChunk } from "./knowledge-base.js";
import type { RetrievedChunk } from "./vector-store.js";

const DEFAULT_RRF_K = 60;

/** Drop chunks below min cosine; if none pass, keep the single best match. */
export function applyMinCosineSimilarity(results: RetrievedChunk[], minScore: number): RetrievedChunk[] {
  const passed = results.filter((r) => r.score >= minScore);
  if (passed.length > 0) return passed;
  if (results.length > 0) return [results[0]!];
  return [];
}

/**
 * Reciprocal rank fusion over vector- and keyword-ranked lists (same chunk `id` merged).
 */
export function mergeHybridRetrieval(
  vectorRanked: RetrievedChunk[],
  keywordRanked: KnowledgeChunk[],
  topK: number,
  rrfK: number = DEFAULT_RRF_K
): RetrievedChunk[] {
  const scores = new Map<string, number>();
  const chunksById = new Map<string, RetrievedChunk>();

  for (let rank = 1; rank <= vectorRanked.length; rank += 1) {
    const c = vectorRanked[rank - 1]!;
    chunksById.set(c.id, c);
    scores.set(c.id, (scores.get(c.id) ?? 0) + 1 / (rrfK + rank));
  }

  for (let rank = 1; rank <= keywordRanked.length; rank += 1) {
    const c = keywordRanked[rank - 1]!;
    if (!chunksById.has(c.id)) {
      chunksById.set(c.id, { ...c, score: 0 });
    }
    scores.set(c.id, (scores.get(c.id) ?? 0) + 1 / (rrfK + rank));
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => {
      const ch = chunksById.get(id)!;
      return { ...ch, score };
    });
}

export function parseRagMinCosineSimilarity(): number {
  const raw = process.env.RAG_MIN_COSINE_SIMILARITY?.trim();
  if (!raw) return 0.25;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0.25;
}

export function parseRagRrfK(): number {
  const raw = process.env.RAG_RRF_K?.trim();
  if (!raw) return DEFAULT_RRF_K;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RRF_K;
}
