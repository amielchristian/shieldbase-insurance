export type ChatRole = 'user' | 'assistant'

export type ChatWireMessage = {
  role: ChatRole
  content: string
}

export type QuoteMeta = null | {
  product?: 'auto' | 'home' | 'life'
  status?: 'inactive' | 'drafting' | 'review' | 'quoted'
  step: string
  missingFields: string[]
}

export type RetrievalMeta = null | Array<{
  id: string
  title: string
  sourcePath: string
  score: number
}>

export type ChatApiResponse = {
  role: 'assistant'
  content: string
  sessionId: string
  meta?: {
    mode?: 'conversational' | 'quotation'
    resetSession?: boolean
    quote?: QuoteMeta
    retrieval?: RetrievalMeta
  }
}

function resolveUrl(path: string, apiBaseUrl?: string) {
  if (!apiBaseUrl) return path
  const normalized = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`
  return new URL(path.replace(/^\//, ''), normalized).toString()
}

async function unwrapError(response: Response, fallback: string) {
  let message = fallback
  try {
    const errorBody = (await response.json()) as { error?: unknown }
    if (typeof errorBody.error === 'string' && errorBody.error.trim()) {
      message = errorBody.error
    }
  } catch {
    // ignore
  }
  return message
}

export async function fetchWelcomeMessage(args: { apiBaseUrl?: string }): Promise<string> {
  const response = await fetch(resolveUrl('/api/chat/welcome', args.apiBaseUrl))
  if (!response.ok) {
    throw new Error('Unable to load welcome message.')
  }
  const data = (await response.json()) as { content?: unknown }
  if (typeof data.content !== 'string' || !data.content.trim()) {
    throw new Error('Invalid welcome response.')
  }
  return data.content
}

export async function postChat(args: {
  apiBaseUrl?: string
  sessionId?: string
  messages: ChatWireMessage[]
}): Promise<ChatApiResponse> {
  const response = await fetch(resolveUrl('/api/chat', args.apiBaseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: args.sessionId, messages: args.messages }),
  })

  if (!response.ok) {
    throw new Error(await unwrapError(response, 'Unable to reach chat service.'))
  }

  return (await response.json()) as ChatApiResponse
}

export async function postClearQuote(args: {
  apiBaseUrl?: string
  sessionId: string
}): Promise<ChatApiResponse> {
  const response = await fetch(resolveUrl('/api/chat/quote/clear', args.apiBaseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: args.sessionId }),
  })

  if (!response.ok) {
    throw new Error(await unwrapError(response, 'Unable to clear quote.'))
  }

  return (await response.json()) as ChatApiResponse
}

