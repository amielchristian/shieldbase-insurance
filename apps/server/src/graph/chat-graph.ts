import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  Annotation,
  END,
  MemorySaver,
  START,
  StateGraph,
  messagesStateReducer,
} from "@langchain/langgraph";
import { z } from "zod";
import { createOpenRouterChatModel } from "../openrouter.js";
import { CHAT_SYSTEM_PROMPT, QUOTE_INTENT_ROUTER_PROMPT, RAG_SYSTEM_PROMPT } from "../prompts/chat.js";
import {
  createInitialQuoteState,
  autoSchema,
  homeSchema,
  lifeSchema,
  detectProduct,
  applyPendingField,
  extractQuoteEditsFromText,
  formatQuote,
  getMissingFields,
  isAcceptIntent,
  isAdjustIntent,
  isResumeIntent,
  isResumableDraft,
  isRestartIntent,
  mergeQuoteData,
  computeQuote,
  questionForField,
  type QuoteProduct,
  type QuoteState,
  type QuoteStep,
} from "../quote/quote.js";
import {
  applyMinCosineSimilarity,
  mergeHybridRetrieval,
  parseRagMinCosineSimilarity,
  parseRagRrfK,
} from "../rag/hybrid-retrieval.js";
import { keywordSearch, loadKnowledgeBaseChunks, type KnowledgeChunk } from "../rag/knowledge-base.js";
import { InMemoryVectorStore, type RetrievedChunk } from "../rag/vector-store.js";

export type WireChatRole = "user" | "assistant";

export type WireChatMessage = {
  role: WireChatRole;
  content: string;
};

export type ChatRetrievalSource = {
  id: string;
  title: string;
  sourcePath: string;
  score: number;
};

export type ChatMeta = {
  mode: "conversational" | "quotation";
  quote: null | {
    product?: QuoteProduct;
    step: QuoteStep;
    missingFields: string[];
  };
  retrieval: ChatRetrievalSource[] | null;
};

export type ChatResponse = {
  content: string;
  meta: ChatMeta;
};

type Route = "rag" | "quote" | "quote_side_question" | "quote_topic_shift" | "restart";
type Mode = "conversational" | "quotation";
type NextNode =
  | typeof END
  | "quote_intent_classify"
  | "rag_retrieve"
  | "rag_answer"
  | "quote_entry"
  | "quote_identify_product"
  | "quote_collect_details"
  | "quote_validate"
  | "quote_generate"
  | "quote_confirm";

type RetrievalForState = Array<Pick<RetrievedChunk, "id" | "title" | "sourcePath" | "content" | "score">>;

const RAG_RETRIEVAL_FETCH_K = 16;
const RAG_RETRIEVAL_FINAL_K = 4;
type QuoteIntentDecision = "continue_quote" | "side_question" | "topic_shift";

const quoteIntentDecisionSchema = z.object({
  intent: z.enum(["continue_quote", "side_question", "topic_shift"]),
});

const ShieldBaseState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  mode: Annotation<Mode>({
    reducer: (_left, right) => right,
    default: () => "conversational",
  }),
  route: Annotation<Route>({
    reducer: (_left, right) => right,
    default: () => "rag",
  }),
  retrieval: Annotation<RetrievalForState>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  next: Annotation<NextNode>({
    reducer: (_left, right) => right,
    default: () => END,
  }),
  quote: Annotation<QuoteState>({
    reducer: (_left, right) => right,
    default: () => createInitialQuoteState(),
  }),
});

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
    if (message.role === "assistant") return new AIMessage(message.content);
    return new HumanMessage(message.content);
  });
}

function lastHumanText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.getType() === "human") return toStringContent(m.content);
  }
  return "";
}

/** Last up to two human turns, for denser retrieval queries on follow-ups. */
function buildRetrievalQuery(messages: BaseMessage[]): string {
  const parts: string[] = [];
  for (let i = messages.length - 1; i >= 0 && parts.length < 2; i -= 1) {
    const m = messages[i];
    if (m?.getType() === "human") {
      const t = toStringContent(m.content).trim();
      if (t) parts.unshift(t);
    }
  }
  return parts.join("\n\n");
}

function takeRecentMessages(messages: BaseMessage[], limit: number): BaseMessage[] {
  if (messages.length <= limit) return messages;
  return messages.slice(Math.max(0, messages.length - limit));
}

function buildMeta(mode: Mode, quote: QuoteState, retrieval: RetrievalForState): ChatMeta {
  const retrievalSummary: ChatRetrievalSource[] | null =
    retrieval.length > 0
      ? retrieval.map((r) => ({
          id: r.id,
          title: r.title,
          sourcePath: r.sourcePath,
          score: r.score,
        }))
      : null;

  if (mode !== "quotation" || !quote.active) {
    return { mode: "conversational", quote: null, retrieval: retrievalSummary };
  }
  const product = quote.product ?? undefined;
  const missing = quote.product ? getMissingFields(quote.product, quote.data) : [];
  return {
    mode: "quotation",
    quote: {
      product,
      step: quote.step,
      missingFields: missing,
    },
    retrieval: retrievalSummary,
  };
}

let kbChunksPromise: Promise<KnowledgeChunk[]> | null = null;
let vectorStorePromise: Promise<InMemoryVectorStore> | null = null;
let vectorStoreReady = false;

async function getKnowledgeBaseChunks(): Promise<KnowledgeChunk[]> {
  if (!kbChunksPromise) kbChunksPromise = loadKnowledgeBaseChunks();
  return kbChunksPromise;
}

async function getVectorStoreOrNull(): Promise<InMemoryVectorStore | null> {
  if (vectorStoreReady) return vectorStorePromise ? await vectorStorePromise : null;
  vectorStoreReady = true;
  try {
    const chunks = await getKnowledgeBaseChunks();
    vectorStorePromise = InMemoryVectorStore.build(chunks);
    return await vectorStorePromise;
  } catch {
    vectorStorePromise = null;
    return null;
  }
}

function detectQuoteIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /\bquote\b|\bquotation\b|\bpremium\b|\bprice\b|\bcost\b|\bhow much\b/.test(t);
}

async function intentRouterNode(state: typeof ShieldBaseState.State) {
  const text = lastHumanText(state.messages);
  const quoteActive = state.quote.active;

  const clearRetrieval = { retrieval: [] as RetrievalForState };

  if (isRestartIntent(text)) {
    return { ...clearRetrieval, route: "restart" as const, next: "quote_entry" as const };
  }

  if (quoteActive) {
    return { ...clearRetrieval, route: "quote" as const, next: "quote_intent_classify" as const };
  }

  if (isResumableDraft(state.quote) && isResumeIntent(text)) {
    return {
      ...clearRetrieval,
      route: "quote" as const,
      quote: { ...state.quote, active: true },
      mode: "quotation" as const,
      next: "quote_entry" as const,
    };
  }

  if (detectQuoteIntent(text)) {
    return { ...clearRetrieval, route: "quote" as const, next: "quote_entry" as const };
  }
  return { ...clearRetrieval, route: "rag" as const, next: "rag_retrieve" as const };
}

async function quoteIntentClassifyNode(state: typeof ShieldBaseState.State) {
  const text = lastHumanText(state.messages);
  const clearRetrieval = { retrieval: [] as RetrievalForState };

  if (!state.quote.active) {
    return { ...clearRetrieval, route: "rag" as const, next: "rag_retrieve" as const };
  }

  const model = createOpenRouterChatModel();
  const classifier = model.withStructuredOutput(quoteIntentDecisionSchema);
  const quote = state.quote;
  const context = [
    `Current quote product: ${quote.product ?? "unknown"}`,
    `Current quote step: ${quote.step}`,
    `Pending field: ${quote.pendingField ?? "none"}`,
    `Last user message: ${text || "(empty)"}`,
  ].join("\n");

  let intent: QuoteIntentDecision = "continue_quote";
  try {
    const result = await classifier.invoke([
      new SystemMessage(QUOTE_INTENT_ROUTER_PROMPT),
      new HumanMessage(context),
    ]);
    intent = result.intent;
  } catch {
    intent = "continue_quote";
  }

  if (intent === "topic_shift") {
    return { ...clearRetrieval, route: "quote_topic_shift" as const, next: "rag_retrieve" as const };
  }
  if (intent === "side_question") {
    return { ...clearRetrieval, route: "quote_side_question" as const, next: "rag_retrieve" as const };
  }
  return { ...clearRetrieval, route: "quote" as const, next: "quote_entry" as const };
}

async function ragRetrieveNode(state: typeof ShieldBaseState.State) {
  const query = buildRetrievalQuery(state.messages);
  const chunks = await getKnowledgeBaseChunks();
  const store = await getVectorStoreOrNull();
  const minCosine = parseRagMinCosineSimilarity();
  const rrfK = parseRagRrfK();

  if (store) {
    const vectorRaw = await store.search(query, RAG_RETRIEVAL_FETCH_K);
    const vectorFiltered = applyMinCosineSimilarity(vectorRaw, minCosine);
    const keywordRanked = keywordSearch(query, chunks, RAG_RETRIEVAL_FETCH_K);
    const merged = mergeHybridRetrieval(vectorFiltered, keywordRanked, RAG_RETRIEVAL_FINAL_K, rrfK);
    return {
      retrieval: merged.map(({ id, title, sourcePath, content, score }) => ({
        id,
        title,
        sourcePath,
        content,
        score,
      })),
      next: "rag_answer" as const,
    };
  }

  const results = keywordSearch(query, chunks, RAG_RETRIEVAL_FINAL_K).map((c, idx) => ({
    ...c,
    score: 1 / (idx + 1),
  }));
  return {
    retrieval: results.map(({ id, title, sourcePath, content, score }) => ({
      id,
      title,
      sourcePath,
      content,
      score,
    })),
    next: "rag_answer" as const,
  };
}

async function ragAnswerNode(state: typeof ShieldBaseState.State) {
  const retrievalBlock = state.retrieval
    .map((c) => {
      const src = c.title ? `${c.title}` : "ShieldBase KB";
      return `SOURCE: ${src}\n${c.content}`;
    })
    .join("\n\n---\n\n");

  const model = createOpenRouterChatModel();
  const ragSystem = new SystemMessage(
    [
      CHAT_SYSTEM_PROMPT,
      "",
      RAG_SYSTEM_PROMPT,
      "",
      "Knowledge base excerpts:",
      retrievalBlock || "(No excerpts available.)",
    ].join("\n")
  );

  const response = await model.invoke([
    ragSystem,
    ...takeRecentMessages(state.messages, 14),
  ]);

  let content = toStringContent(response.content);

  if (state.route === "quote_topic_shift" && state.quote.active) {
    const product = state.quote.product ? `**${state.quote.product}**` : "your";
    content = `${content}\n\n---\n\nI saved ${product} quote draft. Say **continue quote** whenever you want to resume.`;
    return {
      messages: [new AIMessage(content)],
      mode: "conversational" satisfies Mode,
      quote: { ...state.quote, active: false },
      next: END,
    };
  }

  if (state.route === "quote_side_question" && state.quote.active) {
    const product = state.quote.product ? `your **${state.quote.product}** quote` : "your quote";
    content = `${content}\n\n---\n\nIf you want to continue ${product}, say **continue quote**.`;
    return {
      messages: [new AIMessage(content)],
      mode: "quotation" satisfies Mode,
      quote: state.quote,
      next: END,
    };
  }

  return { messages: [new AIMessage(content)], mode: "conversational" satisfies Mode, next: END };
}

function questionFor(product: QuoteProduct, field: string): string {
  return questionForField(product, field);
}

async function quoteEntryNode(state: typeof ShieldBaseState.State) {
  // Single entry/dispatch point for the quote lane.
  const text = lastHumanText(state.messages);
  const restart = isRestartIntent(text);

  if (restart) {
    const quote: QuoteState = { ...createInitialQuoteState(), active: true, step: "identify_product" };
    return { quote, mode: "quotation" as const, next: "quote_identify_product" as const };
  }

  const quote: QuoteState = state.quote.active
    ? state.quote
    : { ...state.quote, active: true, step: "identify_product" as const };

  const step = quote.step;
  const next: NextNode =
    step === "identify_product"
      ? "quote_identify_product"
      : step === "collect_details"
        ? "quote_collect_details"
        : step === "validate"
          ? "quote_validate"
          : step === "generate"
            ? "quote_generate"
            : step === "confirm"
              ? "quote_confirm"
              : END;

  return { quote, mode: "quotation" as const, next };
}

async function quoteIdentifyProductNode(state: typeof ShieldBaseState.State) {
  const text = lastHumanText(state.messages);
  const existing = state.quote.product;
  const detected = existing ?? detectProduct(text);

  const quote: QuoteState = { ...state.quote, active: true, lastQuote: null };

  if (!detected) {
    quote.step = "identify_product";
    quote.pendingField = null;
    const prompt = "Sure. Which type of insurance would you like a quote for: **auto**, **home**, or **life**?";
    return { messages: [new AIMessage(prompt)], quote, mode: "quotation" satisfies Mode, next: END };
  }

  quote.product = detected;
  quote.step = "collect_details";
  quote.pendingField = null;
  return { quote, mode: "quotation" satisfies Mode, next: "quote_collect_details" as const };
}

async function quoteCollectDetailsNode(state: typeof ShieldBaseState.State) {
  const text = lastHumanText(state.messages);
  if (!state.quote.product) return {};

  const product = state.quote.product;
  const pending = state.quote.pendingField;
  const pendingEdits =
    pending && text.trim()
      ? applyPendingField(product, pending, text)
      : {};
  const extractedEdits = extractQuoteEditsFromText(text);
  const edits = {
    auto: { ...(extractedEdits.auto ?? {}), ...(pendingEdits.auto ?? {}) },
    home: { ...(extractedEdits.home ?? {}), ...(pendingEdits.home ?? {}) },
    life: { ...(extractedEdits.life ?? {}), ...(pendingEdits.life ?? {}) },
  };

  const nextQuote: QuoteState = {
    ...state.quote,
    active: true,
    step: "collect_details",
    pendingField: null,
    lastQuote: null,
    data: {
      auto: mergeQuoteData(state.quote.data.auto, edits.auto ?? {}),
      home: mergeQuoteData(state.quote.data.home, edits.home ?? {}),
      life: mergeQuoteData(state.quote.data.life, edits.life ?? {}),
    },
  };

  const missing = getMissingFields(product, nextQuote.data);
  if (missing.length > 0) {
    const field = missing[0]!;
    const prompt = questionFor(product, field);
    return {
      messages: [new AIMessage(prompt)],
      quote: { ...nextQuote, pendingField: field },
      mode: "quotation" satisfies Mode,
      next: END,
    };
  }

  nextQuote.step = "validate";
  return { quote: nextQuote, mode: "quotation" satisfies Mode, next: "quote_validate" as const };
}

async function quoteValidateNode(state: typeof ShieldBaseState.State) {
  if (!state.quote.product) return {};
  const product = state.quote.product;

  try {
    if (product === "auto") {
      autoSchema.parse(state.quote.data.auto);
    } else if (product === "home") {
      homeSchema.parse(state.quote.data.home);
    } else {
      lifeSchema.parse(state.quote.data.life);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid quote details.";
    const prompt = `I found an issue with those details: ${message}\n\nPlease correct it, or say **start over**.`;
    const quote: QuoteState = { ...state.quote, step: "collect_details", pendingField: null, lastQuote: null };
    return { messages: [new AIMessage(prompt)], quote, mode: "quotation" satisfies Mode, next: END };
  }

  const quote: QuoteState = { ...state.quote, step: "generate", pendingField: null };
  return { quote, mode: "quotation" satisfies Mode, next: "quote_generate" as const };
}

async function quoteGenerateNode(state: typeof ShieldBaseState.State) {
  if (!state.quote.product) return {};
  const product = state.quote.product;

  let result;
  try {
    result = computeQuote(product, state.quote.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to generate quote.";
    const prompt = `I couldn’t generate a quote yet: ${message}\n\nPlease adjust the details, or say **start over**.`;
    const quote: QuoteState = { ...state.quote, step: "collect_details", pendingField: null, lastQuote: null };
    return { messages: [new AIMessage(prompt)], quote, mode: "quotation" satisfies Mode, next: END };
  }

  const quote: QuoteState = {
    ...state.quote,
    step: "confirm",
    pendingField: null,
    lastQuote: result,
  };

  return {
    messages: [new AIMessage(formatQuote(product, result))],
    quote,
    mode: "quotation" satisfies Mode,
    next: END,
  };
}

async function quoteConfirmNode(state: typeof ShieldBaseState.State) {
  const text = lastHumanText(state.messages);
  const quote = state.quote;

  if (isRestartIntent(text)) {
    const reset: QuoteState = { ...createInitialQuoteState(), active: true, step: "identify_product" };
    const prompt = "No problem. Which type of quote do you want now: **auto**, **home**, or **life**?";
    return { messages: [new AIMessage(prompt)], quote: reset, mode: "quotation" satisfies Mode, next: END };
  }

  if (isAcceptIntent(text)) {
    const done: QuoteState = { ...quote, active: false, step: "done", pendingField: null };
    const prompt =
      "Great—I can’t bind coverage from chat, but I’ve recorded your selection. If you want another quote, just say **quote** and the product type.";
    return { messages: [new AIMessage(prompt)], quote: done, mode: "conversational" satisfies Mode, next: END };
  }

  // Switch product mid-confirmation.
  const switched = detectProduct(text);
  if (switched && switched !== quote.product) {
    const reset: QuoteState = { ...createInitialQuoteState(), active: true, product: switched, step: "collect_details" };
    return { quote: reset, mode: "quotation" satisfies Mode, next: "quote_collect_details" as const };
  }

  if (quote.product && isAdjustIntent(text)) {
    // Treat this as more input and continue collecting; the collect node will either
    // ask the next missing field or regenerate a quote.
    const next: QuoteState = { ...quote, step: "collect_details", pendingField: null };
    return { quote: next, mode: "quotation" satisfies Mode, next: "quote_collect_details" as const };
  }

  const prompt = "Reply **accept**, tell me what to adjust, or say **start over**.";
  return { messages: [new AIMessage(prompt)], mode: "quotation" satisfies Mode, next: END };
}

const checkpointer = new MemorySaver();

/** Compiled graph; use for `invoke` and for `getGraphAsync` + `drawMermaid`. */
export const compiledChatGraph = new StateGraph(ShieldBaseState)
  .addNode("intent_router", intentRouterNode)
  .addNode("quote_intent_classify", quoteIntentClassifyNode)
  .addNode("rag_retrieve", ragRetrieveNode)
  .addNode("rag_answer", ragAnswerNode)
  .addNode("quote_entry", quoteEntryNode)
  .addNode("quote_identify_product", quoteIdentifyProductNode)
  .addNode("quote_collect_details", quoteCollectDetailsNode)
  .addNode("quote_validate", quoteValidateNode)
  .addNode("quote_generate", quoteGenerateNode)
  .addNode("quote_confirm", quoteConfirmNode)
  .addEdge(START, "intent_router")
  .addConditionalEdges("intent_router", (state) => state.next)
  .addConditionalEdges("quote_intent_classify", (state) => state.next)
  .addEdge("rag_retrieve", "rag_answer")
  .addEdge("rag_answer", END)
  .addConditionalEdges("quote_entry", (state) => state.next)
  .addConditionalEdges("quote_identify_product", (state) => state.next)
  .addConditionalEdges("quote_collect_details", (state) => state.next)
  .addConditionalEdges("quote_validate", (state) => state.next)
  .addEdge("quote_generate", END)
  .addConditionalEdges("quote_confirm", (state) => state.next)
  .compile({ checkpointer });

export async function invokeChatGraph(input: {
  sessionId: string;
  messages: WireChatMessage[];
}): Promise<ChatResponse> {
  const { sessionId, messages } = input;

  // Server is stateful: client should send only new messages per turn.
  // We still accept arrays, but we only append what's provided.
  const incoming = toLangChainMessages(messages);
  const state = await compiledChatGraph.invoke(
    { messages: incoming },
    { configurable: { thread_id: sessionId }, recursionLimit: 50 }
  );

  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const message = state.messages[i];
    if (!message) continue;
    if (message.getType() === "ai") {
      return {
        content: toStringContent(message.content),
        meta: buildMeta(state.mode, state.quote, state.retrieval),
      };
    }
  }

  throw new Error("No assistant response returned from LangGraph");
}
