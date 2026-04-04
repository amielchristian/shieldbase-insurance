import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";
import type { ChatResponse, WireChatMessage } from "./graph/chat-graph.js";
import { CHAT_WELCOME_MESSAGE } from "./prompts/chat.js";

describe("http routes", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("returns health status", async () => {
    const app = await buildServer({ logger: false });
    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("returns static welcome message", async () => {
    const app = await buildServer({ logger: false });
    const response = await app.inject({ method: "GET", url: "/api/chat/welcome" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      role: "assistant",
      content: CHAT_WELCOME_MESSAGE,
    });
  });

  it("rejects invalid chat payloads", async () => {
    const app = await buildServer({ logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { messages: [] },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Invalid body" });
  });

  it("uses injected graph handler and returns generated session id", async () => {
    const invokeGraph = vi.fn<
      (input: { sessionId: string; messages: WireChatMessage[] }) => Promise<ChatResponse>
    >(async () => ({
      content: "Mocked response",
      meta: { mode: "conversational", quote: null },
    }));

    const app = await buildServer({ logger: false, invokeGraph });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { messages: [{ role: "user", content: "hello" }] },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.role).toBe("assistant");
    expect(body.content).toBe("Mocked response");
    expect(body.meta).toEqual({ mode: "conversational", quote: null });
    expect(typeof body.sessionId).toBe("string");
    expect(body.sessionId.length).toBeGreaterThan(0);
    expect(invokeGraph).toHaveBeenCalledTimes(1);
  });
});
