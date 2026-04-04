# Turborepo starter

## ShieldBase chat environment

Chat API (Fastify + LangGraph):

- `GET /api/chat/welcome` — hardcoded first assistant message (copy in `apps/server/src/prompts/chat.ts`).
- `POST /api/chat` — hybrid reply (RAG + quoting); expects a `sessionId` for stateful sessions and returns `{ content, meta, sessionId }`.
- `POST /api/chat/quote/clear` — clears the current quote draft state for a session (`{ sessionId }`).
- `GET /api/graph/diagram` — HTML page that **renders** the chat graph as Mermaid (source from `compiledChatGraph.getGraphAsync().drawMermaid()`; open in a browser; proxied under `/api` in Vite dev).

Set these before running `apps/server`:

- `OPENROUTER_API_KEY` (required)
- `OPENROUTER_MODEL` (optional, defaults to `openai/gpt-4o-mini`)
- `OPENROUTER_EMBEDDINGS_MODEL` (optional, defaults to `text-embedding-3-small`)
- `OPENROUTER_HTTP_REFERER` (optional)
- `OPENROUTER_APP_NAME` (optional)

Optional chat/session settings:

- `CHAT_CHECKPOINT_DB_PATH` (optional, default `./data/chat-checkpoints.sqlite`) — durable session storage (SQLite via Node’s `node:sqlite`).
- `CHAT_CHECKPOINT_MAX_PER_THREAD` (optional) — if set, prunes older checkpoints per session.
- `QUOTE_DRAFT_TTL_MINUTES` (optional, default `60`) — pauses an active quote draft after inactivity.

Note: `node:sqlite` is still experimental in Node and may emit an ExperimentalWarning. The server falls back to an in-memory checkpointer if SQLite is unavailable.

RAG tuning (optional):

- `RAG_MIN_COSINE_SIMILARITY` — minimum cosine similarity for dense retrieval before hybrid merge (default `0.25`; if no chunk passes, the best match is kept).
- `RAG_RRF_K` — reciprocal rank fusion constant (default `60`).
- `RAG_EMBEDDING_CACHE_DIR` — directory for embedding disk cache (default `~/.cache/shieldbase-rag`). Omit or clear to rebuild embeddings after KB changes.

The chat client uses `/api/chat` and proxies to `http://localhost:3001` in Vite by default. Override proxy target with `VITE_SERVER_URL` if needed.

### Optional embed (bonus)

You can embed the chat UI in another site via an iframe (example):

```html
<iframe
  src="http://localhost:5173"
  style="width: 420px; height: 640px; border: 0; border-radius: 16px;"
  title="ShieldBase chat widget"
></iframe>
```

This Turborepo starter is maintained by the Turborepo core team.

## Using this example

Run the following command:

```sh
npx create-turbo@latest
```

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `docs`: a [Next.js](https://nextjs.org/) app
- `web`: another [Next.js](https://nextjs.org/) app
- `@repo/ui`: a stub React component library shared by both `web` and `docs` applications
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo build
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo build
yarn dlx turbo build
pnpm exec turbo build
```

You can build a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo build --filter=docs
```

Without global `turbo`:

```sh
npx turbo build --filter=docs
yarn exec turbo build --filter=docs
pnpm exec turbo build --filter=docs
```

### Develop

To develop all apps and packages, run the following command:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo dev
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo dev
yarn exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo dev --filter=web
```

Without global `turbo`:

```sh
npx turbo dev --filter=web
yarn exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo login
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo login
yarn exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo link
```

Without global `turbo`:

```sh
npx turbo link
yarn exec turbo link
pnpm exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.dev/docs/reference/configuration)
- [CLI Usage](https://turborepo.dev/docs/reference/command-line-reference)

## Specifications
Below are the instructions for the project.

Software Engineer Take-Home Assessment
LangGraph Hybrid Chatbot: Insurance Quotation Assistant
Role: Mid-Level Software Engineer
Time Limit: 24 hours from receipt
Deliverables: Working code repository
AI Tools: Allowed (see note in Section 9
1. Overview
Build an insurance quotation assistant using LangGraph that combines conversational AI
(answering questions about insurance products via RAG with transactional capabilities
(collecting customer information and generating a quote through a structured workflow).
The bot should use a state machine as its orchestrator to route user intent to the right
flow.
We are not looking for a production-ready product. We want to see how you design state
transitions, handle the boundary between free-form conversation and structured
transactions, and how quickly you can build something coherent with an unfamiliar
framework.
2. The Scenario
Your chatbot is an AI assistant for a fictional insurance company called “ShieldBase
Insurance.
ˮ ShieldBase offers three types of insurance: auto, home, and life. The
assistant helps prospective customers learn about these products and get personalized
quotes.
Your chatbot must support two modes of interaction:
2.1 Conversational Mode RAG
The user asks general questions about ShieldBaseʼs insurance products. The bot retrieves
relevant information from your knowledge base and responds naturally. Examples:
•
“What types of insurance do you offer?ˮ
•
•
•
“What does your auto policy cover?ˮ
“Do you cover pre-existing conditions on life insurance?ˮ
“Whatʼs the difference between comprehensive and third-party auto coverage?ˮ
2.2 Transactional Mode Quotation Flow)
The user wants to get a personalized insurance quote. The bot should guide them through
a structured workflow to collect the required information, then generate a quote. The flow
should include at minimum:
1. Identify insurance type — which product does the user want a quote for (auto,
home, or life)?
2. Collect customer details — gather the relevant information for that product type.
For example:
◦ Auto: vehicle year/make/model, driver age, driving history, desired
coverage level
◦ Home: property type, location, estimated value, desired coverage level
◦ Life: age, health status, coverage amount, term length
3. Validate inputs — check that provided information is reasonable (e.g., vehicle year
is not in the future, age is a valid number)
4. Generate and present quote — compute a simple quote based on the collected
data (the formula can be basic/dummy) and present it to the user
5. Confirm or restart — let the user accept the quote, adjust details, or start over with
a different product
3. Requirements
3.1 Must-Have Core
6. 7. LangGraph state machine orchestrator – routes between conversational and
transactional modes based on detected user intent. The graph structure and state
transitions should be clearly defined.
Intent detection – classifies whether the user wants to ask a question about
insurance (conversational) or get a quote (transactional), and routes accordingly.
8. RAG-powered – retrieves from your insurance knowledge base and generates
grounded answers. Doesnʼt need to be fancy — a simple vector store with your
insurance documents is fine.
9. Quotation flow – clear step-by-step progression (identify product → collect details
→ validate → generate quote → confirm), with input validation at each step.
10. Graceful transitions – bot should handle a user switching intent mid-conversation
(e.g., asking a product question while in the middle of a quotation flow) without
crashing or losing collected data.
3.2 Performance & Frontend Bonus
We evaluate whether your chatbot feels fast and polished — not just functional.
A. Latency Optimization
Minimize perceived wait time. Optimize your chatbot for low latency without sacrificing
response accuracy.
B. Frontend & Chat Experience
Build a web-based chat UI that feels like a real product — clear message bubbles, smooth
scroll, loading states. Bonus: package it as an embeddable widget (iframe, web
component, or script tag) with a short integration snippet showing how to drop it into any
website.
4. Knowledge Base
Create a small knowledge base 510 documents or text chunks) about ShieldBase
Insurance. This can be as simple as markdown or text files covering:
• Company overview and available products (auto, home, life)
• Coverage details for each product type (whatʼs included, whatʼs excluded)
• Pricing tiers or coverage levels (e.g., basic, standard, comprehensive)
• Claims process and policies (deductibles, filing deadlines, etc.)
• FAQs (eligibility, cancellation policy, bundling discounts, etc.)
The content can be fictional. Include these documents in your repository.
5. Technical Guidance
You are free to choose your own tools and providers. Some suggestions:
• Framework: LangGraph (required)
• LLM Any model accessible via OpenRouter
• Vector store: any
• Embeddings: any
• Interface: web application / widget (if possible)
We highly encourage the use of AI coding assistants. We expect most candidates will.
5.1 Provided API Key
We will provide you with an OpenRouter API key with a $10 credit limit for this
assessment. Use this key for all LLM and embedding API calls.
6. Follow-Up Interview
After reviewing your submission, we will schedule a follow-up interview where you will be
asked to:
● Present your solution — walk us through your architecture, state machine design,
and key decisions
● Demo your bot live and handle test scenarios we throw at it
● Answer questions about your code/design
