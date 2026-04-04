import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const chatBodySchema = z.object({
  sessionId: z.string().min(1).optional(),
  messages: z.array(chatMessageSchema).min(1),
});

export type ChatBody = z.infer<typeof chatBodySchema>;
