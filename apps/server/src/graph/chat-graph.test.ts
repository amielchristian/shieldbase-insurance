import { describe, expect, it, vi } from "vitest";

vi.mock("../openrouter.js", () => {
  return {
    createOpenRouterEmbeddings: () => ({
      embedDocuments: async (texts: string[]) => texts.map((_, idx) => [idx + 1, 1]),
      embedQuery: async (_query: string) => [1, 1],
    }),
    createOpenRouterChatModel: () => ({
      withStructuredOutput: () => ({
        invoke: async () => ({ intent: "continue_quote" }),
      }),
      invoke: async () => ({ content: "Mocked grounded response." }),
    }),
  };
});

import { invokeChatGraph } from "./chat-graph.js";

describe("invokeChatGraph with mocked OpenRouter dependencies", () => {
  it("returns conversational response for a RAG question", async () => {
    const result = await invokeChatGraph({
      sessionId: "test-rag-thread",
      messages: [{ role: "user", content: "What insurance products do you offer?" }],
    });

    expect(result.content).toContain("Mocked grounded response.");
    expect(result.meta.mode).toBe("conversational");
    expect(result.meta.quote).toBeNull();
  });
});
