import { afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHAT_WELCOME_MESSAGE } from "./prompts/chat.js";

function dbPathFor(testName: string) {
  return join(tmpdir(), `shieldbase-server-${testName}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
}

async function loadServer(dbPath: string) {
  vi.resetModules();
  process.env.CHAT_CHECKPOINT_DB_PATH = dbPath;
  process.env.CHAT_CHECKPOINT_MAX_PER_THREAD = "";
  const mod = await import("./app.js");
  return mod as typeof import("./app.js");
}

describe("http routes", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("returns health status", async () => {
    const dbPath = dbPathFor("health");
    const { buildServer } = await loadServer(dbPath);
    const app = await buildServer({ logger: false });
    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    rmSync(dbPath, { force: true });
  });

  it("returns static welcome message", async () => {
    const dbPath = dbPathFor("welcome");
    const { buildServer } = await loadServer(dbPath);
    const app = await buildServer({ logger: false });
    const response = await app.inject({ method: "GET", url: "/api/chat/welcome" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      role: "assistant",
      content: CHAT_WELCOME_MESSAGE,
    });
    rmSync(dbPath, { force: true });
  });

  it("rejects invalid chat payloads", async () => {
    const dbPath = dbPathFor("invalid");
    const { buildServer } = await loadServer(dbPath);
    const app = await buildServer({ logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { messages: [] },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Invalid body" });
    rmSync(dbPath, { force: true });
  });

  it("uses injected graph handler and returns generated session id", async () => {
    const dbPath = dbPathFor("injected");
    const { buildServer } = await loadServer(dbPath);

    const invokeGraph = vi.fn(async (_input: { sessionId: string; messages: Array<{ role: string; content: string }> }) => ({
      content: "Mocked response",
      meta: { mode: "conversational", quote: null, retrieval: null },
    }));

    const app = await buildServer({ logger: false, invokeGraph: invokeGraph as any });
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
    expect(body.meta).toEqual({ mode: "conversational", quote: null, retrieval: null });
    expect(typeof body.sessionId).toBe("string");
    expect(body.sessionId.length).toBeGreaterThan(0);
    expect(invokeGraph).toHaveBeenCalledTimes(1);
    rmSync(dbPath, { force: true });
  });

  it("clears quote state via /api/chat/quote/clear", async () => {
    const dbPath = dbPathFor("clear-quote");
    const { buildServer } = await loadServer(dbPath);
    const app = await buildServer({ logger: false });

    const clear = await app.inject({
      method: "POST",
      url: "/api/chat/quote/clear",
      payload: { sessionId: "test-clear-thread" },
    });

    await app.close();

    expect(clear.statusCode).toBe(200);
    const body = clear.json();
    expect(body.role).toBe("assistant");
    expect(body.content).toBe("Quote cleared.");
    expect(body.meta).toEqual({ mode: "conversational", quote: null, retrieval: null });
    expect(body.sessionId).toBe("test-clear-thread");
    rmSync(dbPath, { force: true });
  });
});

