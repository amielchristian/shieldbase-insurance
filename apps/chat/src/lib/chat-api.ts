export type ChatRole = "user" | "assistant" | "system";

export type ChatWireMessage = {
  role: ChatRole;
  content: string;
};

type ChatApiResponse = {
  role: "assistant";
  content: string;
};

export async function postChat(messages: ChatWireMessage[]): Promise<ChatApiResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
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
