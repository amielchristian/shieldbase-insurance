import { randomUUID } from "node:crypto";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import { invokeChatGraph, type ChatResponse, type WireChatMessage } from "./graph/chat-graph.js";
import { getChatGraphDiagramHtml } from "./graph/graph-diagram.js";
import { CHAT_WELCOME_MESSAGE } from "./prompts/chat.js";
import { chatBodySchema } from "./schemas/chat.js";
import { echoBodySchema } from "./schemas/echo.js";

type ChatGraphInvoker = (input: {
  sessionId: string;
  messages: WireChatMessage[];
}) => Promise<ChatResponse>;

type BuildServerOptions = {
  logger?: boolean | FastifyBaseLogger;
  invokeGraph?: ChatGraphInvoker;
};

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  const graphInvoker = options.invokeGraph ?? invokeChatGraph;

  await app.register(fastifyCors, { origin: true });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/chat/welcome", async () => ({
    role: "assistant" as const,
    content: CHAT_WELCOME_MESSAGE,
  }));

  app.get("/api/graph/diagram", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(await getChatGraphDiagramHtml());
  });

  app.post("/echo", async (request, reply) => {
    const parsed = echoBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid body",
        details: parsed.error.flatten(),
      });
    }
    return { echo: parsed.data.message };
  });

  app.post("/api/chat", async (request, reply) => {
    const parsed = chatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid body",
        details: parsed.error.flatten(),
      });
    }

    try {
      const sessionId = parsed.data.sessionId ?? randomUUID();
      const response = await graphInvoker({
        sessionId,
        messages: parsed.data.messages,
      });
      return { role: "assistant", ...response, sessionId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat service failed";
      const statusCode = message.includes("OPENROUTER_API_KEY") ? 500 : 502;
      request.log.error({ error }, "Failed to generate chat response");
      return reply.status(statusCode).send({ error: message });
    }
  });

  return app;
}
