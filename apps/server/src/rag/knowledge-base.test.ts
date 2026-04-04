import { describe, expect, it } from "vitest";
import { keywordSearch, type KnowledgeChunk } from "./knowledge-base.js";

const chunks: KnowledgeChunk[] = [
  {
    id: "a1",
    title: "Auto Coverage",
    sourcePath: "/tmp/auto.md",
    content: "Comprehensive auto coverage includes collision and theft.",
  },
  {
    id: "h1",
    title: "Home Coverage",
    sourcePath: "/tmp/home.md",
    content: "Home insurance covers fire and wind with deductible terms.",
  },
  {
    id: "l1",
    title: "Life Policy",
    sourcePath: "/tmp/life.md",
    content: "Life coverage terms depend on age and health status.",
  },
];

describe("keywordSearch", () => {
  it("returns top matches by token overlap", () => {
    const result = keywordSearch("auto collision coverage", chunks, 2);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("a1");
  });

  it("returns first k chunks for empty queries", () => {
    const result = keywordSearch("", chunks, 2);
    expect(result.map((c) => c.id)).toEqual(["a1", "h1"]);
  });

  it("returns no chunks when there are no matches", () => {
    const result = keywordSearch("space travel", chunks, 3);
    expect(result).toEqual([]);
  });
});
