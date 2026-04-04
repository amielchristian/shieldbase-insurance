import { describe, expect, it } from "vitest";
import type { KnowledgeChunk } from "./knowledge-base.js";
import type { RetrievedChunk } from "./vector-store.js";
import { applyMinCosineSimilarity, mergeHybridRetrieval } from "./hybrid-retrieval.js";

const chunk = (id: string, title: string): KnowledgeChunk => ({
  id,
  title,
  sourcePath: `/kb/${id}.md`,
  content: `body ${id}`,
});

describe("applyMinCosineSimilarity", () => {
  it("keeps results at or above the threshold", () => {
    const results: RetrievedChunk[] = [
      { ...chunk("a", "A"), score: 0.9 },
      { ...chunk("b", "B"), score: 0.2 },
    ];
    expect(applyMinCosineSimilarity(results, 0.25)).toEqual([results[0]]);
  });

  it("falls back to the top result when none pass", () => {
    const results: RetrievedChunk[] = [
      { ...chunk("a", "A"), score: 0.1 },
      { ...chunk("b", "B"), score: 0.05 },
    ];
    expect(applyMinCosineSimilarity(results, 0.25)).toEqual([results[0]]);
  });
});

describe("mergeHybridRetrieval", () => {
  it("boosts chunks that appear in both rankings", () => {
    const v: RetrievedChunk[] = [
      { ...chunk("x", "X"), score: 0.99 },
      { ...chunk("y", "Y"), score: 0.5 },
    ];
    const k: KnowledgeChunk[] = [chunk("y", "Y"), chunk("z", "Z")];
    const merged = mergeHybridRetrieval(v, k, 3, 60);
    expect(merged.map((m) => m.id)).toContain("y");
    expect(merged.length).toBeLessThanOrEqual(3);
  });
});
