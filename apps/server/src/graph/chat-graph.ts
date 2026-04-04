import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MessagesAnnotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { CHAT_SYSTEM_PROMPT } from "../prompts/chat.js";

export type WireChatRole = "user" | "assistant";

export type WireChatMessage = {
  role: WireChatRole;
  content: string;
};

function toStringContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function toLangChainMessages(messages: WireChatMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      return new AIMessage(message.content);
    }
    return new HumanMessage(message.content);
  });
}

/** Compiled graph; use for `invoke` / streaming and for `getGraphAsync` + `drawMermaid`. */
export const compiledChatGraph = new StateGraph(MessagesAnnotation)
  .addNode("model", async (state) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY");
    }

    const model = new ChatOpenAI({
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

    const response = await model.invoke(state.messages);
    return { messages: [response] };
  })
  .addEdge(START, "model")
  .addEdge("model", END)
  .compile();

export async function invokeChatGraph(messages: WireChatMessage[]): Promise<string> {
  const state = await compiledChatGraph.invoke({
    messages: [
      new SystemMessage(CHAT_SYSTEM_PROMPT),
      ...toLangChainMessages(messages),
    ],
  });

  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const message = state.messages[i];
    if (!message) continue;
    if (message.getType() === "ai") {
      return toStringContent(message.content);
    }
  }

  throw new Error("No assistant response returned from LangGraph");
}
