import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type KnowledgeChunk = {
  id: string;
  title: string;
  sourcePath: string;
  content: string;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractTitle(markdown: string, fallback: string): string {
  const m = markdown.match(/^#\s+(.+)\s*$/m);
  if (m?.[1]) return m[1].trim();
  return fallback;
}

function splitIntoReasonableChunks(markdown: string, maxLen = 1200): string[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // First split on H2 boundaries so sections stay coherent.
  const parts = normalized.split(/\n(?=##\s+)/g);
  const chunks: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxLen) {
      chunks.push(trimmed);
      continue;
    }

    // Fallback: chunk by length with overlap on paragraph boundaries.
    const paras = trimmed.split(/\n{2,}/g);
    let buf = "";
    for (const para of paras) {
      const next = buf ? `${buf}\n\n${para}` : para;
      if (next.length <= maxLen) {
        buf = next;
        continue;
      }

      if (buf) chunks.push(buf.trim());
      if (para.length <= maxLen) {
        buf = para;
        continue;
      }

      // Hard split very long paragraph.
      for (let i = 0; i < para.length; i += maxLen - 200) {
        chunks.push(para.slice(i, i + maxLen).trim());
      }
      buf = "";
    }
    if (buf.trim()) chunks.push(buf.trim());
  }

  return chunks;
}

export async function loadKnowledgeBaseChunks(): Promise<KnowledgeChunk[]> {
  // apps/server -> repo root -> knowledge-base
  const kbDir = join(process.cwd(), "..", "..", "knowledge-base");
  const files = (await readdir(kbDir)).filter((f) => f.endsWith(".md")).sort();

  const chunks: KnowledgeChunk[] = [];
  for (const file of files) {
    const sourcePath = join(kbDir, file);
    const markdown = await readFile(sourcePath, "utf8");
    const title = extractTitle(markdown, file);
    const split = splitIntoReasonableChunks(markdown);
    split.forEach((content, idx) => {
      chunks.push({
        id: `${slugify(file)}-${idx + 1}`,
        title,
        sourcePath,
        content,
      });
    });
  }

  return chunks;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length > 2);
}

export function keywordSearch(query: string, chunks: KnowledgeChunk[], k: number): KnowledgeChunk[] {
  const q = new Set(tokenize(query));
  if (q.size === 0) return chunks.slice(0, k);

  const scored = chunks
    .map((c) => {
      const toks = tokenize(`${c.title}\n${c.content}`);
      let score = 0;
      for (const t of toks) if (q.has(t)) score += 1;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.filter((s) => s.score > 0).slice(0, k).map((s) => s.c);
}

