import { describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

let structuredOutputBehavior: "continue" | "throw" = "continue";

vi.mock("../openrouter.js", () => {
  return {
    createOpenRouterEmbeddings: () => ({
      embedDocuments: async (texts: string[]) => texts.map((_, idx) => [idx + 1, 1]),
      embedQuery: async (_query: string) => [1, 1],
    }),
    createOpenRouterChatModel: () => ({
      withStructuredOutput: () => ({
        invoke: async () => {
          if (structuredOutputBehavior === "throw") throw new Error("Classifier failed");
          return { intent: "continue_quote" };
        },
      }),
      invoke: async () => ({ content: "Mocked grounded response." }),
    }),
  };
});

function dbPathFor(testName: string) {
  return join(tmpdir(), `shieldbase-chat-${testName}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
}

async function loadGraph(dbPath: string) {
  vi.resetModules();
  process.env.CHAT_CHECKPOINT_DB_PATH = dbPath;
  process.env.CHAT_CHECKPOINT_MAX_PER_THREAD = "";
  process.env.QUOTE_DRAFT_TTL_MINUTES = "60";
  const mod = await import("./chat-graph.js");
  return mod as typeof import("./chat-graph.js");
}

describe("invokeChatGraph (quote escape + resiliency)", () => {
  it("cancels an active quote and does not keep a resumable draft", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("cancel");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const sessionId = "test-cancel-thread";

    // Enter quote flow.
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "quote" }] });
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "auto" }] });

    const canceled = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "never mind, cancel the quote" }],
    });

    expect(canceled.meta.mode).toBe("conversational");
    expect(canceled.meta.quote).toBeNull();

    const resumed = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "continue quote" }],
    });
    expect(resumed.meta.mode).toBe("conversational");

    rmSync(dbPath, { force: true });
  });

  it("pauses an active quote and resumes from the saved draft", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("pause");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const sessionId = "test-pause-thread";

    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "quote" }] });
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "auto" }] });

    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "2020" }] });
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "Toyota" }] });

    const paused = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "finish later" }],
    });
    expect(paused.meta.mode).toBe("conversational");
    expect(paused.meta.quote).toBeNull();

    const resumed = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "continue quote" }],
    });
    expect(resumed.meta.mode).toBe("quotation");
    expect(resumed.content.toLowerCase()).toContain("model");

    rmSync(dbPath, { force: true });
  });

  it("asks for clarification when quote intent classification fails", async () => {
    structuredOutputBehavior = "throw";
    const dbPath = dbPathFor("classifier-throw");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const sessionId = "test-classifier-thread";

    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "quote" }] });
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "auto" }] });

    const clarify = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "What does comprehensive coverage include?" }],
    });

    expect(clarify.meta.mode).toBe("quotation");
    expect(clarify.content.toLowerCase()).toContain("side question");

    structuredOutputBehavior = "continue";
    const side = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "side question" }],
    });
    expect(side.content).toContain("Mocked grounded response.");

    rmSync(dbPath, { force: true });
  });

  it("routes edit intent to a targeted pending-field question", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("edit");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const sessionId = "test-edit-thread";

    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "quote" }] });
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "auto" }] });

    const edit = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "change driver age" }],
    });
    expect(edit.meta.mode).toBe("quotation");
    expect(edit.content.toLowerCase()).toContain("old");

    rmSync(dbPath, { force: true });
  });

  it("deletes thread state and signals the client to reset its session", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("delete");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const sessionId = "test-delete-thread";

    const deleted = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "delete my data" }],
    });

    expect(deleted.meta.resetSession).toBe(true);
    expect(deleted.meta.mode).toBe("conversational");

    const db = new DatabaseSync(dbPath);
    const count = (db.prepare("SELECT COUNT(*) as c FROM checkpoints WHERE thread_id = ?").get(sessionId) as { c: number }).c;
    expect(count).toBe(0);

    rmSync(dbPath, { force: true });
  });
});

describe("invokeChatGraph (RAG meta)", () => {
  it("returns retrieval sources for a KB question", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("rag-meta");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const result = await invokeChatGraph({
      sessionId: "test-rag-thread",
      messages: [{ role: "user", content: "What insurance products do you offer?" }],
    });

    expect(result.content).toContain("Mocked grounded response.");
    expect(result.meta.mode).toBe("conversational");
    expect(result.meta.quote).toBeNull();
    expect(result.meta.retrieval).not.toBeNull();
    expect(result.meta.retrieval!.length).toBeGreaterThan(0);
    expect(result.meta.retrieval![0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      sourcePath: expect.any(String),
      score: expect.any(Number),
    });

    rmSync(dbPath, { force: true });
  });
});

