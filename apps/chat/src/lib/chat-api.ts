export type ChatRole = "user" | "assistant";

export type ChatWireMessage = {
  role: ChatRole;
  content: string;
};

type ChatApiResponse = {
  role: "assistant";
  content: string;
  sessionId: string;
  meta?: {
    mode?: "conversational" | "quotation";
    quote?: null | {
      product?: "auto" | "home" | "life";
      step: string;
      missingFields: string[];
    };
  };
};

export async function fetchWelcomeMessage(): Promise<string> {
  const response = await fetch("/api/chat/welcome");
  if (!response.ok) {
    throw new Error("Unable to load welcome message.");
  }
  const data = (await response.json()) as { content?: unknown };
  if (typeof data.content !== "string" || !data.content.trim()) {
    throw new Error("Invalid welcome response.");
  }
  return data.content;
}

export async function postChat(args: {
  sessionId?: string;
  messages: ChatWireMessage[];
}): Promise<ChatApiResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId: args.sessionId, messages: args.messages }),
  });

  if (!response.ok) {
    let message = "Unable to reach chat service.";
    try {
      const errorBody = (await response.json()) as { error?: unknown };
      if (typeof errorBody.error === "string" && errorBody.error.trim()) {
        message = errorBody.error;
      }
    } catch {
      // Keep generic message when response is not valid JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as ChatApiResponse;
}
