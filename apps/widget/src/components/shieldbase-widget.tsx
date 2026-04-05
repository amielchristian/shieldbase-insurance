import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  fetchWelcomeMessage,
  postChat,
  type ChatApiResponse,
} from '../lib/chat-api'
import { renderMarkdown } from '../lib/markdown'

type Role = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: Role
  content: string
}

type Meta = null | {
  mode?: 'conversational' | 'quotation'
  resetSession?: boolean
  quote?: unknown
  retrieval?: unknown
}

const DEFAULT_SUGGESTIONS = [
  'What types of insurance do you offer?',
  'What does your auto policy cover?',
  "What's the difference between liability and comprehensive auto coverage?",
  'How do I file a claim and what are the deadlines?',
  "I'd like a quote for auto insurance.",
] as const

let idCounter = 0
function nextId() {
  idCounter += 1
  return `m-${idCounter}`
}

function busyCopyFor(text: string) {
  return /\bquote\b|\bpremium\b|\bcost\b|\bprice\b/i.test(text)
    ? 'Calculating a quote…'
    : 'Drafting a response…'
}

function extractMeta(response: ChatApiResponse): Meta {
  return response.meta ?? null
}

export function ShieldBaseWidget(props: {
  apiBaseUrl?: string
  storageKey?: string
  title?: string
  suggestions?: readonly string[]
}) {
  const titleId = useId()
  const storageKey = props.storageKey ?? 'shieldbase:sessionId'
  const suggestions = props.suggestions ?? DEFAULT_SUGGESTIONS

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [welcomeLoading, setWelcomeLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('Drafting a response…')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [meta, setMeta] = useState<Meta>(null)

  const endRef = useRef<HTMLDivElement>(null)

  const title = useMemo(() => props.title ?? 'ShieldBase Support', [props.title])
  const apiBaseUrl = props.apiBaseUrl

  useEffect(() => {
    try {
      const existing = localStorage.getItem(storageKey)
      if (existing) setSessionId(existing)
    } catch {
      // ignore
    }
  }, [storageKey])

  useEffect(() => {
    let cancelled = false
    fetchWelcomeMessage({ apiBaseUrl })
      .then((content) => {
        if (cancelled) return
        setMessages([{ id: nextId(), role: 'assistant', content }])
      })
      .catch(() => {
        if (cancelled) return
        setMessages([
          {
            id: nextId(),
            role: 'assistant',
            content:
              'We could not load the welcome message. Check that the server is running and try again.',
          },
        ])
      })
      .finally(() => {
        if (!cancelled) setWelcomeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiBaseUrl])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy, welcomeLoading])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy || welcomeLoading) return

    setBusyLabel(busyCopyFor(trimmed))

    const userMessage: ChatMessage = { id: nextId(), role: 'user', content: trimmed }
    const requestMessages = [{ role: 'user' as const, content: trimmed }]

    setDraft('')
    setMessages((m) => [...m, userMessage])
    setBusy(true)

    try {
      const response = await postChat({
        apiBaseUrl,
        sessionId: sessionId ?? undefined,
        messages: requestMessages,
      })

      if (typeof response.sessionId === 'string' && response.sessionId.trim()) {
        setSessionId(response.sessionId)
        try {
          localStorage.setItem(storageKey, response.sessionId)
        } catch {
          // ignore
        }
      }

      setMeta(extractMeta(response))
      setMessages((m) => [...m, { id: nextId(), role: 'assistant', content: response.content }])

      if (response.meta?.resetSession) {
        try {
          localStorage.removeItem(storageKey)
        } catch {
          // ignore
        }
        setSessionId(null)
        setMeta(null)
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Something went wrong while contacting support.'
      setMessages((m) => [...m, { id: nextId(), role: 'assistant', content: `Error: ${message}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="sbw" aria-labelledby={titleId} role="region">
      <header className="sbw-header">
        <div className="sbw-title">
          <div className="sbw-badge" aria-hidden>
            SB
          </div>
          <div className="sbw-titleText">
            <h1 id={titleId}>{title}</h1>
            <p>AI chat for coverage, claims, and quotes</p>
          </div>
        </div>
      </header>

      <div className="sbw-body">
        <div className="sbw-thread" role="log" aria-live="polite">
          <div className="sbw-quickstart">
            <div className="sbw-quickstartTitle">Quick start</div>
            <div className="sbw-suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="sbw-chip"
                  onClick={() => send(s)}
                  disabled={busy || welcomeLoading}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <ul className="sbw-messages">
            {messages.map((msg) => (
              <li key={msg.id}>
                <MessageRow message={msg} />
              </li>
            ))}
          </ul>

          {welcomeLoading ? (
            <div className="sbw-status" aria-busy>
              Loading welcome…
            </div>
          ) : null}

          {busy ? (
            <div className="sbw-status" aria-busy>
              {busyLabel}
            </div>
          ) : null}

          <div ref={endRef} />
        </div>

        <form
          className="sbw-composer"
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
        >
          <label className="sbw-srOnly" htmlFor="sbw-input">
            Message
          </label>
          <textarea
            id="sbw-input"
            className="sbw-textarea"
            rows={2}
            placeholder="Type your question…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(draft)
              }
            }}
            disabled={busy || welcomeLoading}
          />
          <div className="sbw-composerRow">
            <div className="sbw-hint">
              <kbd>Enter</kbd> send · <kbd>Shift+Enter</kbd> newline
            </div>
            <button className="sbw-btn" type="submit" disabled={busy || welcomeLoading || !draft.trim()}>
              Send
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`sbw-row ${isUser ? 'sbw-row--user' : 'sbw-row--assistant'}`}>
      <div className="sbw-avatar" aria-hidden>
        {isUser ? 'You' : 'SB'}
      </div>
      <div className={`sbw-bubble ${isUser ? 'sbw-bubble--user' : 'sbw-bubble--assistant'}`}>
        <div className="sbw-message">{renderMarkdown(message.content)}</div>
      </div>
    </div>
  )
}
