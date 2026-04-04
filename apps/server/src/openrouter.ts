import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value || !value.trim()) {
    throw new Error(`Missing ${key}`);
  }
  return value;
}

let cachedChat: ChatOpenAI | null = null;
let cachedEmbeddings: OpenAIEmbeddings | null = null;

export function createOpenRouterChatModel() {
  if (cachedChat) return cachedChat;
  const apiKey = getRequiredEnv("OPENROUTER_API_KEY");
  cachedChat = new ChatOpenAI({
    model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
    apiKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        ...(process.env.OPENROUTER_HTTP_REFERER
          ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
          : {}),
        ...(process.env.OPENROUTER_APP_NAME
          ? { "X-Title": process.env.OPENROUTER_APP_NAME }
          : {}),
      },
    },
  });
  return cachedChat;
}

export function createOpenRouterEmbeddings() {
  if (cachedEmbeddings) return cachedEmbeddings;
  const apiKey = getRequiredEnv("OPENROUTER_API_KEY");
  const model = process.env.OPENROUTER_EMBEDDINGS_MODEL ?? "text-embedding-3-small";
  cachedEmbeddings = new OpenAIEmbeddings({
    apiKey,
    model,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        ...(process.env.OPENROUTER_HTTP_REFERER
          ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
          : {}),
        ...(process.env.OPENROUTER_APP_NAME
          ? { "X-Title": process.env.OPENROUTER_APP_NAME }
          : {}),
      },
    },
  });
  return cachedEmbeddings;
}

/** Model id used for embeddings (cache keys, logging). Does not instantiate the client. */
export function getOpenRouterEmbeddingsModelName(): string {
  return process.env.OPENROUTER_EMBEDDINGS_MODEL?.trim() || "text-embedding-3-small";
}
