import { describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let structuredOutputBehavior: "continue" | "throw" = "continue";

vi.mock("../openrouter.js", () => {
  return {
    createOpenRouterEmbeddings: () => ({
      embedDocuments: async (texts: string[]) => texts.map((_, idx) => [idx + 1, 1]),
      embedQuery: async (_query: string) => [1, 1],
    }),
    createOpenRouterChatModel: () => ({
      withStructuredOutput: () => ({
        invoke: async (messages?: unknown) => {
          if (structuredOutputBehavior === "throw") throw new Error("Classifier failed");
          const serialized = JSON.stringify(messages ?? "").toLowerCase();
          const atReview = serialized.includes("current quote step: review");
          const atConfirm = serialized.includes("current quote step: confirm");
          const isDoIt = serialized.includes("last user message: do it");
          const isGenerate = serialized.includes("last user message: generate");

          if (
            serialized.includes("last user message: never mind, cancel the quote") ||
            serialized.includes("last user message: i want out") ||
            serialized.includes("last user message: i don't want to do this anymore") ||
            serialized.includes("last user message: fuck this")
          ) {
            return { intent: "cancel_quote" };
          }
          if (serialized.includes("last user message: finish later")) {
            return { intent: "pause_quote" };
          }
          if (serialized.includes("last user message: side question")) {
            return { intent: "side_question" };
          }
          if (serialized.includes("last user message: topic shift")) {
            return { intent: "topic_shift" };
          }
          if (serialized.includes("last user message: continue quote")) {
            return { intent: "resume_quote" };
          }
          if (atReview && (isDoIt || isGenerate || serialized.includes("last user message: proceed"))) {
            return { intent: "confirm_generate" };
          }
          if (
            atConfirm &&
            (isDoIt ||
              isGenerate ||
              serialized.includes("last user message: yes") ||
              serialized.includes("last user message: accept"))
          ) {
            return { intent: "accept_quote" };
          }
          if (serialized.includes("last user message: change")) {
            return { intent: "adjust_quote" };
          }
          if (
            serialized.includes("last user message: quote") ||
            serialized.includes("qoute") ||
            serialized.includes("last user message: how much would home insurance cost for me?") ||
            serialized.includes("last user message: generate")
          ) {
            return { intent: "start_quote" };
          }
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

  it("cancels quote on disengagement phrasing during detail collection", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("cancel-disengage");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const sessionId = "test-cancel-disengage-thread";

    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "quote" }] });
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "home" }] });

    const canceled = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "i want out" }],
    });
    expect(canceled.meta.mode).toBe("conversational");
    expect(canceled.meta.quote).toBeNull();
    expect(canceled.content.toLowerCase()).toContain("cleared the quote");

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
    expect(resumed.content.toLowerCase()).toContain("driver age");

    rmSync(dbPath, { force: true });
  });

  it("starts quote flow for common quote typos like qoute", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("quote-typo");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const started = await invokeChatGraph({
      sessionId: "test-quote-typo-thread",
      messages: [{ role: "user", content: "i'd like a qoute" }],
    });

    expect(started.meta.mode).toBe("quotation");
    expect(started.content.toLowerCase()).toContain("which type of insurance");

    rmSync(dbPath, { force: true });
  });

  it("starts quote flow for estimate intent without the word quote", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("estimate-intent");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const started = await invokeChatGraph({
      sessionId: "test-estimate-intent-thread",
      messages: [{ role: "user", content: "how much would home insurance cost for me?" }],
    });

    expect(started.meta.mode).toBe("quotation");
    expect(started.meta.quote?.product).toBe("home");
    expect(started.content.toLowerCase()).toContain("list of required fields");
    expect(started.content.toLowerCase()).toContain("property type");

    rmSync(dbPath, { force: true });
  });

  it("starts quote flow for terse start intents like generate", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("generate-intent");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const started = await invokeChatGraph({
      sessionId: "test-generate-intent-thread",
      messages: [{ role: "user", content: "generate" }],
    });

    expect(started.meta.mode).toBe("quotation");
    expect(started.content.toLowerCase()).toContain("which type of insurance");

    rmSync(dbPath, { force: true });
  });

  it("progresses from review and confirm using short do-it phrasing", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("do-it-review-confirm");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const sessionId = "test-do-it-review-confirm-thread";
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "quote" }] });
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "auto" }] });

    const review = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "2020 Toyota Camry, age 35, clean, comprehensive" }],
    });
    expect(review.meta.mode).toBe("quotation");
    expect(review.meta.quote?.step).toBe("review");
    expect(review.content.toLowerCase()).toContain("generate the quote now");

    const generated = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "do it" }],
    });
    expect(generated.meta.mode).toBe("quotation");
    expect(generated.meta.quote?.step).toBe("confirm");
    expect(generated.content.toLowerCase()).not.toContain("generate the quote now");

    const accepted = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "do it" }],
    });
    expect(accepted.meta.mode).toBe("conversational");
    expect(accepted.meta.quote).toBeNull();
    expect(accepted.content.toLowerCase()).toContain("recorded your selection");

    rmSync(dbPath, { force: true });
  });

  it("keeps topic-shift saved drafts resumable", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("topic-shift-resume");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const sessionId = "test-topic-shift-resume-thread";

    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "quote" }] });
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "auto" }] });

    const shifted = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "topic shift" }],
    });
    expect(shifted.meta.mode).toBe("conversational");
    expect(shifted.content.toLowerCase()).toContain("saved");

    const resumed = await invokeChatGraph({
      sessionId,
      messages: [{ role: "user", content: "continue quote" }],
    });
    expect(resumed.meta.mode).toBe("quotation");

    rmSync(dbPath, { force: true });
  });

  it("asks for clarification when quote intent classification fails", async () => {
    structuredOutputBehavior = "continue";
    const dbPath = dbPathFor("classifier-throw");
    const { invokeChatGraph } = await loadGraph(dbPath);

    const sessionId = "test-classifier-thread";

    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "quote" }] });
    await invokeChatGraph({ sessionId, messages: [{ role: "user", content: "auto" }] });

    structuredOutputBehavior = "throw";
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
    expect(side.content.toLowerCase()).not.toContain("continue quote");

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
    expect(edit.content.toLowerCase()).toContain("driver age");

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

    const sqlite = await import("node:sqlite").catch(() => null);
    if (sqlite?.DatabaseSync) {
      const db = new sqlite.DatabaseSync(dbPath);
      const count = (db.prepare("SELECT COUNT(*) as c FROM checkpoints WHERE thread_id = ?").get(sessionId) as { c: number }).c;
      expect(count).toBe(0);
    }

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

