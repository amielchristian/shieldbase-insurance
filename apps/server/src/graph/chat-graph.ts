import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  Annotation,
  END,
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
  formatQuoteDraftSummary,
  formatQuote,
  getMissingFields,
  isAcceptIntent,
  isAdjustIntent,
  isCancelIntent,
  isConfirmIntent,
  isDeleteDataIntent,
  isEditIntent,
  isPauseIntent,
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
import { keywordSearch, loadKnowledgeBaseChunks, type KnowledgeChunk } from "../rag/knowledge-base.js";
import { InMemoryVectorStore, type RetrievedChunk } from "../rag/vector-store.js";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

export type WireChatRole = "user" | "assistant";

export type WireChatMessage = {
  role: WireChatRole;
  content: string;
};

export type ChatMeta = {
  mode: "conversational" | "quotation";
  resetSession?: boolean;
  quote: null | {
    product?: QuoteProduct;
    status: QuoteState["status"];
    step: QuoteStep;
    missingFields: string[];
  };
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
  | "quote_resume_missing"
  | "quote_identify_product"
  | "quote_collect_details"
  | "quote_review"
  | "quote_validate"
  | "quote_generate"
  | "quote_confirm"
  | "quote_cancel_reset"
  | "quote_pause_draft"
  | "quote_stale_pause"
  | "quote_edit_dispatch"
  | "thread_delete";

type RetrievalForState = Array<Pick<RetrievedChunk, "title" | "sourcePath" | "content" | "score">>;
type QuoteIntentDecision = "continue_quote" | "side_question" | "topic_shift" | "cancel_quote";

const quoteIntentDecisionSchema = z.object({
  intent: z.enum(["continue_quote", "side_question", "topic_shift", "cancel_quote"]),
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
  quoteIntentClarifying: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
  }),
  resetSession: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
  }),
  deleteThreadRequested: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
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

function takeRecentMessages(messages: BaseMessage[], limit: number): BaseMessage[] {
  if (messages.length <= limit) return messages;
  return messages.slice(Math.max(0, messages.length - limit));
}

function buildMeta(mode: Mode, quote: QuoteState): ChatMeta {
  if (mode !== "quotation" || !quote.active) {
    return { mode: "conversational", quote: null };
  }
  const product = quote.product ?? undefined;
  const missing = quote.product ? getMissingFields(quote.product, quote.data) : [];
  return {
    mode: "quotation",
    quote: {
      product,
      status: quote.status,
      step: quote.step,
      missingFields: missing,
    },
  };
}

function buildMetaWithFlags(mode: Mode, quote: QuoteState, flags: { resetSession: boolean }): ChatMeta {
  const meta = buildMeta(mode, quote);
  if (flags.resetSession) meta.resetSession = true;
  return meta;
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

function isStaleQuote(quote: QuoteState): boolean {
  if (!quote.active) return false;
  const ttlMinutes = process.env.QUOTE_DRAFT_TTL_MINUTES ? Number(process.env.QUOTE_DRAFT_TTL_MINUTES) : 60;
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) return false;
  const updated = Date.parse(quote.lastUpdatedAt);
  if (!Number.isFinite(updated)) return false;
  return Date.now() - updated > ttlMinutes * 60_000;
}

function looksLikeCoverageQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\?\s*$/.test(t)) return true;
  const lower = t.toLowerCase();
  if (/^(what|why|how|when|where|can|do|does|is|are)\b/.test(lower)) return true;
  return /\b(cover|coverage|include|excluded?|deductible|liability|comprehensive|collision|premium)\b/.test(lower);
}

async function intentRouterNode(state: typeof ShieldBaseState.State) {
  const text = lastHumanText(state.messages);
  const quoteActive = state.quote.active;

  if (isDeleteDataIntent(text)) {
    return { route: "rag" as const, next: "thread_delete" as const };
  }

  if (isCancelIntent(text) && (quoteActive || isResumableDraft(state.quote))) {
    return { route: "rag" as const, next: "quote_cancel_reset" as const };
  }

  if (quoteActive && isPauseIntent(text)) {
    return { route: "rag" as const, next: "quote_pause_draft" as const };
  }

  if (quoteActive && isStaleQuote(state.quote)) {
    return { route: "rag" as const, next: "quote_stale_pause" as const };
  }

  if (!quoteActive && isResumeIntent(text) && !isResumableDraft(state.quote)) {
    return { route: "rag" as const, next: "quote_resume_missing" as const };
  }

  if (quoteActive && state.quoteIntentClarifying) {
    const lower = text.toLowerCase();
    if (isCancelIntent(text)) {
      return { quoteIntentClarifying: false, route: "rag" as const, next: "quote_cancel_reset" as const };
    }
    if (/\b(side|question|ask)\b/.test(lower)) {
      return { quoteIntentClarifying: false, route: "quote_side_question" as const, next: "rag_retrieve" as const };
    }
    return { quoteIntentClarifying: false, route: "quote" as const, next: "quote_entry" as const };
  }

  if (isRestartIntent(text)) {
    return { route: "restart" as const, next: "quote_entry" as const };
  }

  if (quoteActive) {
    if (isEditIntent(text)) return { route: "quote" as const, next: "quote_edit_dispatch" as const };
    return { route: "quote" as const, next: "quote_intent_classify" as const };
  }

  if (isResumableDraft(state.quote) && isResumeIntent(text)) {
    return {
      route: "quote" as const,
      quote: { ...state.quote, active: true },
      mode: "quotation" as const,
      next: "quote_entry" as const,
    };
  }

  if (detectQuoteIntent(text)) return { route: "quote" as const, next: "quote_entry" as const };
  return { route: "rag" as const, next: "rag_retrieve" as const };
}

async function quoteIntentClassifyNode(state: typeof ShieldBaseState.State) {
  const text = lastHumanText(state.messages);
  if (!state.quote.active) {
    return { route: "rag" as const, next: "rag_retrieve" as const };
  }

  if (isCancelIntent(text)) {
    return { route: "rag" as const, next: "quote_cancel_reset" as const };
  }

  if (!looksLikeCoverageQuestion(text)) {
    return { route: "quote" as const, next: "quote_entry" as const };
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
    const prompt =
      "Do you want to **continue your quote**, ask a **side question**, or **cancel the quote**?\n\n" +
      "Reply with: **continue**, **side question**, or **cancel**.";
    return {
      messages: [new AIMessage(prompt)],
      quoteIntentClarifying: true,
      mode: "quotation" satisfies Mode,
      quote: state.quote,
      next: END,
    };
  }

  if (intent === "cancel_quote") {
    return { route: "rag" as const, next: "quote_cancel_reset" as const };
  }
  if (intent === "topic_shift") {
    return { route: "quote_topic_shift" as const, next: "rag_retrieve" as const };
  }
  if (intent === "side_question") {
    return { route: "quote_side_question" as const, next: "rag_retrieve" as const };
  }
  return { route: "quote" as const, next: "quote_entry" as const };
}

async function ragRetrieveNode(state: typeof ShieldBaseState.State) {
  const query = lastHumanText(state.messages);
  const chunks = await getKnowledgeBaseChunks();
  const store = await getVectorStoreOrNull();

  if (store) {
    const results = await store.search(query, 4);
    return {
      retrieval: results.map(({ title, sourcePath, content, score }) => ({ title, sourcePath, content, score })),
      next: "rag_answer" as const,
    };
  }

  const results = keywordSearch(query, chunks, 4).map((c, idx) => ({
    ...c,
    score: 1 / (idx + 1),
  }));
  return {
    retrieval: results.map(({ title, sourcePath, content, score }) => ({ title, sourcePath, content, score })),
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

function nowIso(): string {
  return new Date().toISOString();
}

async function quoteResumeMissingNode(_state: typeof ShieldBaseState.State) {
  const prompt =
    "There isn’t a saved quote draft to resume. Say **quote** to start a new one, or ask a coverage question anytime.";
  return { messages: [new AIMessage(prompt)], mode: "conversational" satisfies Mode, next: END };
}

async function quoteCancelResetNode(_state: typeof ShieldBaseState.State) {
  const quote = createInitialQuoteState();
  const prompt = "Got it — I cleared the quote. What would you like to do next?";
  return { messages: [new AIMessage(prompt)], quote, mode: "conversational" satisfies Mode, next: END };
}

async function quotePauseDraftNode(state: typeof ShieldBaseState.State) {
  const quote: QuoteState = {
    ...state.quote,
    active: false,
    status: "inactive",
    lastUpdatedAt: nowIso(),
  };
  const prompt = "No problem — I paused your quote draft. Say **continue quote** anytime to resume, or **cancel quote** to clear it.";
  return { messages: [new AIMessage(prompt)], quote, mode: "conversational" satisfies Mode, next: END };
}

async function quoteStalePauseNode(state: typeof ShieldBaseState.State) {
  const quote: QuoteState = {
    ...state.quote,
    active: false,
    status: "inactive",
    lastUpdatedAt: nowIso(),
  };
  const prompt =
    "Your quote draft is paused because it’s been a while. Say **continue quote** to resume or **cancel quote** to clear it.";
  return { messages: [new AIMessage(prompt)], quote, mode: "conversational" satisfies Mode, next: END };
}

async function threadDeleteNode(_state: typeof ShieldBaseState.State) {
  const quote = createInitialQuoteState();
  const prompt = "Done — I deleted this chat session’s stored state. You can start fresh any time.";
  return {
    messages: [new AIMessage(prompt)],
    quote,
    resetSession: true,
    deleteThreadRequested: true,
    mode: "conversational" satisfies Mode,
    next: END,
  };
}

function detectFieldToEdit(text: string, product: QuoteProduct | null): { product: QuoteProduct | null; field: string | null } {
  const lower = text.toLowerCase();

  const fieldFromText = () => {
    if (/\b(driver age|age)\b/.test(lower)) return product === "life" ? "age" : "driverAge";
    if (/\bvehicle year|\byear\b/.test(lower)) return "vehicleYear";
    if (/\bmake\b/.test(lower)) return "make";
    if (/\bmodel\b/.test(lower)) return "model";
    if (/\b(driving history|tickets?|violations?|accident)\b/.test(lower)) return "drivingHistory";
    if (/\bcoverage level|coverage\b/.test(lower)) return "coverageLevel";
    if (/\bproperty type\b/.test(lower)) return "propertyType";
    if (/\blocation\b|\bcity\b|\bstate\b/.test(lower)) return "location";
    if (/\b(estimated )?value\b/.test(lower)) return "estimatedValue";
    if (/\bcoverage amount\b|\bbenefit\b/.test(lower)) return "coverageAmount";
    if (/\bterm\b/.test(lower)) return "termLengthYears";
    return null;
  };

  // If user mentions a product while editing, allow switching the draft product.
  const detected = detectProduct(text);
  const chosenProduct = detected ?? product;

  return { product: chosenProduct, field: fieldFromText() };
}

async function quoteEditDispatchNode(state: typeof ShieldBaseState.State) {
  const text = lastHumanText(state.messages);
  const current = state.quote;

  if (!current.product) {
    const prompt = "Sure — which type of quote is this: **auto**, **home**, or **life**?";
    const quote: QuoteState = {
      ...current,
      active: true,
      status: "drafting",
      step: "identify_product",
      pendingField: null,
      lastQuote: null,
      lastUpdatedAt: nowIso(),
    };
    return { messages: [new AIMessage(prompt)], quote, mode: "quotation" satisfies Mode, next: END };
  }

  const { product, field } = detectFieldToEdit(text, current.product);
  const nextProduct = product ?? current.product;

  // Switch product: reset data but keep quote lane active.
  if (nextProduct !== current.product) {
    const reset: QuoteState = {
      ...createInitialQuoteState(),
      active: true,
      status: "drafting",
      product: nextProduct,
      step: "collect_details",
      pendingField: null,
      lastUpdatedAt: nowIso(),
    };
    return { quote: reset, mode: "quotation" satisfies Mode, next: "quote_collect_details" as const };
  }

  if (field) {
    const prompt = questionFor(nextProduct, field);
    const quote: QuoteState = {
      ...current,
      active: true,
      status: "drafting",
      step: "collect_details",
      pendingField: field,
      lastQuote: null,
      lastUpdatedAt: nowIso(),
    };
    return { messages: [new AIMessage(prompt)], quote, mode: "quotation" satisfies Mode, next: END };
  }

  if (current.pendingField) {
    const prompt = questionFor(nextProduct, current.pendingField);
    const quote: QuoteState = { ...current, active: true, status: "drafting", step: "collect_details", lastUpdatedAt: nowIso() };
    return { messages: [new AIMessage(prompt)], quote, mode: "quotation" satisfies Mode, next: END };
  }

  const prompt = "What would you like to change? (e.g. “driver age”, “coverage level”, “term length”)";
  return { messages: [new AIMessage(prompt)], quote: { ...current, lastUpdatedAt: nowIso() }, mode: "quotation" satisfies Mode, next: END };
}

async function quoteEntryNode(state: typeof ShieldBaseState.State) {
  // Single entry/dispatch point for the quote lane.
  const text = lastHumanText(state.messages);
  const restart = isRestartIntent(text);

  if (restart) {
    const quote: QuoteState = {
      ...createInitialQuoteState(),
      active: true,
      status: "drafting",
      step: "identify_product",
      lastUpdatedAt: nowIso(),
    };
    return { quote, mode: "quotation" as const, next: "quote_identify_product" as const };
  }

  const quote: QuoteState = state.quote.active
    ? state.quote
    : {
        ...state.quote,
        active: true,
        status: "drafting",
        step: "identify_product" as const,
        lastUpdatedAt: nowIso(),
      };

  const step = quote.step;
  const next: NextNode =
    step === "identify_product"
      ? "quote_identify_product"
      : step === "collect_details"
        ? "quote_collect_details"
        : step === "review"
          ? "quote_review"
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

  const quote: QuoteState = { ...state.quote, active: true, status: "drafting", lastQuote: null, lastUpdatedAt: nowIso() };

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

  // Treat resume commands as control flow, not a field answer.
  if (isResumeIntent(text)) {
    const missing = getMissingFields(product, state.quote.data);
    const field = state.quote.pendingField ?? missing[0] ?? null;
    if (field) {
      const prompt = questionFor(product, field);
      const quote: QuoteState = {
        ...state.quote,
        active: true,
        status: "drafting",
        step: "collect_details",
        pendingField: field,
        lastUpdatedAt: nowIso(),
      };
      return { messages: [new AIMessage(prompt)], quote, mode: "quotation" satisfies Mode, next: END };
    }
  }

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
    status: "drafting",
    step: "collect_details",
    pendingField: null,
    lastQuote: null,
    lastUpdatedAt: nowIso(),
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

  nextQuote.step = "review";
  nextQuote.status = "review";
  const prompt =
    `${formatQuoteDraftSummary(product, nextQuote.data)}\n\n` +
    "Reply **confirm** to generate a quote, or tell me what to change. You can also say **finish later** or **cancel quote**.";
  return { messages: [new AIMessage(prompt)], quote: nextQuote, mode: "quotation" satisfies Mode, next: END };
}

async function quoteReviewNode(state: typeof ShieldBaseState.State) {
  const text = lastHumanText(state.messages);
  const quote = state.quote;
  if (!quote.product) return { next: "quote_identify_product" as const };

  if (isRestartIntent(text)) {
    const reset: QuoteState = {
      ...createInitialQuoteState(),
      active: true,
      status: "drafting",
      step: "identify_product",
      lastUpdatedAt: nowIso(),
    };
    const prompt = "No problem. Which type of quote do you want now: **auto**, **home**, or **life**?";
    return { messages: [new AIMessage(prompt)], quote: reset, mode: "quotation" satisfies Mode, next: END };
  }

  if (isCancelIntent(text)) {
    return { next: "quote_cancel_reset" as const };
  }

  if (isPauseIntent(text)) {
    return { next: "quote_pause_draft" as const };
  }

  if (isConfirmIntent(text)) {
    const next: QuoteState = { ...quote, status: "drafting", step: "validate", pendingField: null, lastUpdatedAt: nowIso() };
    return { quote: next, mode: "quotation" satisfies Mode, next: "quote_validate" as const };
  }

  const extracted = extractQuoteEditsFromText(text);
  const hasEdits =
    (extracted.auto && Object.keys(extracted.auto).length > 0) ||
    (extracted.home && Object.keys(extracted.home).length > 0) ||
    (extracted.life && Object.keys(extracted.life).length > 0);

  if (quote.product && (isAdjustIntent(text) || hasEdits)) {
    const next: QuoteState = { ...quote, status: "drafting", step: "collect_details", pendingField: null, lastUpdatedAt: nowIso() };
    return { quote: next, mode: "quotation" satisfies Mode, next: "quote_collect_details" as const };
  }

  const prompt = "Reply **confirm** to generate a quote, or tell me what to change.";
  return { messages: [new AIMessage(prompt)], quote: { ...quote, lastUpdatedAt: nowIso() }, mode: "quotation" satisfies Mode, next: END };
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
    let pendingField: string | null = null;
    let message = err instanceof Error ? err.message : "Invalid quote details.";
    if (err && typeof err === "object" && "issues" in err) {
      const zodErr = err as { issues?: Array<{ path?: unknown[]; message?: string }> };
      const issue = zodErr.issues?.[0];
      const path0 = issue?.path?.[0];
      if (typeof path0 === "string") pendingField = path0;
      if (typeof issue?.message === "string" && issue.message.trim()) message = issue.message;
    }

    const question = pendingField ? questionFor(product, pendingField) : "Please correct that detail.";
    const prompt = `That detail doesn’t look right: ${message}\n\n${question}\n\nYou can also say **start over**.`;
    const quote: QuoteState = {
      ...state.quote,
      status: "drafting",
      step: "collect_details",
      pendingField,
      lastQuote: null,
      lastUpdatedAt: nowIso(),
    };
    return { messages: [new AIMessage(prompt)], quote, mode: "quotation" satisfies Mode, next: END };
  }

  const quote: QuoteState = { ...state.quote, status: "drafting", step: "generate", pendingField: null, lastUpdatedAt: nowIso() };
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
    const quote: QuoteState = { ...state.quote, status: "drafting", step: "collect_details", pendingField: null, lastQuote: null, lastUpdatedAt: nowIso() };
    return { messages: [new AIMessage(prompt)], quote, mode: "quotation" satisfies Mode, next: END };
  }

  const quote: QuoteState = {
    ...state.quote,
    status: "quoted",
    step: "confirm",
    pendingField: null,
    lastQuote: result,
    lastUpdatedAt: nowIso(),
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
    const reset: QuoteState = { ...createInitialQuoteState(), active: true, status: "drafting", step: "identify_product", lastUpdatedAt: nowIso() };
    const prompt = "No problem. Which type of quote do you want now: **auto**, **home**, or **life**?";
    return { messages: [new AIMessage(prompt)], quote: reset, mode: "quotation" satisfies Mode, next: END };
  }

  if (isAcceptIntent(text)) {
    const done: QuoteState = { ...quote, active: false, status: "inactive", step: "done", pendingField: null, lastUpdatedAt: nowIso() };
    const prompt =
      "Great—I can’t bind coverage from chat, but I’ve recorded your selection. If you want another quote, just say **quote** and the product type.";
    return { messages: [new AIMessage(prompt)], quote: done, mode: "conversational" satisfies Mode, next: END };
  }

  // Switch product mid-confirmation.
  const switched = detectProduct(text);
  if (switched && switched !== quote.product) {
    const reset: QuoteState = {
      ...createInitialQuoteState(),
      active: true,
      status: "drafting",
      product: switched,
      step: "collect_details",
      lastUpdatedAt: nowIso(),
    };
    return { quote: reset, mode: "quotation" satisfies Mode, next: "quote_collect_details" as const };
  }

  if (quote.product && isAdjustIntent(text)) {
    // Treat this as more input and continue collecting; the collect node will either
    // ask the next missing field or regenerate a quote.
    const next: QuoteState = { ...quote, status: "drafting", step: "collect_details", pendingField: null, lastQuote: null, lastUpdatedAt: nowIso() };
    return { quote: next, mode: "quotation" satisfies Mode, next: "quote_collect_details" as const };
  }

  const prompt = "Reply **accept**, tell me what to adjust, or say **start over**.";
  return { messages: [new AIMessage(prompt)], quote: { ...quote, lastUpdatedAt: nowIso() }, mode: "quotation" satisfies Mode, next: END };
}

const checkpointer: BaseCheckpointSaver = await (async () => {
  const max = process.env.CHAT_CHECKPOINT_MAX_PER_THREAD
    ? Number(process.env.CHAT_CHECKPOINT_MAX_PER_THREAD)
    : null;
  const maxPerThread = Number.isFinite(max) && (max as number) > 0 ? (max as number) : null;
  const dbPath = process.env.CHAT_CHECKPOINT_DB_PATH ?? "./data/chat-checkpoints.sqlite";

  try {
    const { SqliteSaver } = await import("./sqlite-saver.js");
    return new SqliteSaver(dbPath, { maxPerThread });
  } catch {
    // Fallback for older Node runtimes that do not support `node:sqlite`.
    const { MemorySaver } = await import("@langchain/langgraph");
    return new MemorySaver();
  }
})();

/** Compiled graph; use for `invoke` and for `getGraphAsync` + `drawMermaid`. */
export const compiledChatGraph = new StateGraph(ShieldBaseState)
  .addNode("intent_router", intentRouterNode)
  .addNode("quote_intent_classify", quoteIntentClassifyNode)
  .addNode("rag_retrieve", ragRetrieveNode)
  .addNode("rag_answer", ragAnswerNode)
  .addNode("quote_entry", quoteEntryNode)
  .addNode("quote_resume_missing", quoteResumeMissingNode)
  .addNode("quote_cancel_reset", quoteCancelResetNode)
  .addNode("quote_pause_draft", quotePauseDraftNode)
  .addNode("quote_stale_pause", quoteStalePauseNode)
  .addNode("quote_edit_dispatch", quoteEditDispatchNode)
  .addNode("thread_delete", threadDeleteNode)
  .addNode("quote_identify_product", quoteIdentifyProductNode)
  .addNode("quote_collect_details", quoteCollectDetailsNode)
  .addNode("quote_review", quoteReviewNode)
  .addNode("quote_validate", quoteValidateNode)
  .addNode("quote_generate", quoteGenerateNode)
  .addNode("quote_confirm", quoteConfirmNode)
  .addEdge(START, "intent_router")
  .addConditionalEdges("intent_router", (state) => state.next)
  .addConditionalEdges("quote_intent_classify", (state) => state.next)
  .addEdge("rag_retrieve", "rag_answer")
  .addEdge("rag_answer", END)
  .addEdge("quote_resume_missing", END)
  .addEdge("quote_cancel_reset", END)
  .addEdge("quote_pause_draft", END)
  .addEdge("quote_stale_pause", END)
  .addEdge("thread_delete", END)
  .addConditionalEdges("quote_entry", (state) => state.next)
  .addConditionalEdges("quote_edit_dispatch", (state) => state.next)
  .addConditionalEdges("quote_identify_product", (state) => state.next)
  .addConditionalEdges("quote_collect_details", (state) => state.next)
  .addConditionalEdges("quote_review", (state) => state.next)
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

  if (state.deleteThreadRequested) {
    try {
      await checkpointer.deleteThread(sessionId);
    } catch {
      // Best-effort deletion; keep response to the user.
    }
  }

  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const message = state.messages[i];
    if (!message) continue;
    if (message.getType() === "ai") {
      return {
        content: toStringContent(message.content),
        meta: buildMetaWithFlags(state.mode, state.quote, { resetSession: state.resetSession }),
      };
    }
  }

  throw new Error("No assistant response returned from LangGraph");
}
