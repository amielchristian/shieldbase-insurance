import { useEffect, useId, useRef, useState } from 'react'
import {
  Car,
  FileText,
  HeartHandshake,
  Home,
  Loader2,
  MessageCircle,
  SendHorizontal,
  Sparkles,
} from 'lucide-react'
import { ShieldMark } from '@/components/shield-logo'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { fetchWelcomeMessage, postChat, postClearQuote } from '@/lib/chat-api'
import { renderMarkdown } from '@/lib/markdown'
import { cn } from '@/lib/utils'

type Role = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: Role
  content: string
}

type QuoteMeta = null | {
  product?: 'auto' | 'home' | 'life'
  status?: 'inactive' | 'drafting' | 'review' | 'quoted'
  step: string
  missingFields: string[]
}

type ServerMeta = {
  mode?: 'conversational' | 'quotation'
  resetSession?: boolean
  quote?: QuoteMeta
} | null

/** Quick-start prompts aligned with README assessment examples and `knowledge-base/*.md`. */
const SUGGESTIONS = [
  'What types of insurance do you offer?',
  'What does your auto policy cover?',
  "What's the difference between liability and comprehensive auto coverage?",
  'What is typically excluded on term life policies?',
  'How do I file a claim and what are the deadlines?',
  "I'd like a quote for auto insurance.",
] as const

let idCounter = 0
function nextId() {
  idCounter += 1
  return `m-${idCounter}`
}

export function ChatSupport() {
  const titleId = useId()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [welcomeLoading, setWelcomeLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string>('ShieldBase is drafting a response…')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [meta, setMeta] = useState<ServerMeta>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const existing = localStorage.getItem('shieldbase:sessionId')
      if (existing) setSessionId(existing)
    } catch {
      // Ignore storage access errors.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchWelcomeMessage()
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
              'We could not load the welcome message. Check that the server is running and try refreshing.',
          },
        ])
      })
      .finally(() => {
        if (!cancelled) setWelcomeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy, welcomeLoading])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy || welcomeLoading) return

    setBusyLabel(
      /\bquote\b|\bpremium\b|\bcost\b|\bprice\b/i.test(trimmed)
        ? 'ShieldBase is calculating a quote…'
        : 'ShieldBase is drafting a response…',
    )

    const userMessage: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
    }
    const requestMessages = [{ role: 'user' as const, content: trimmed }]

    setDraft('')
    setMessages((m) => [...m, userMessage])
    setBusy(true)

    try {
      const response = await postChat({ sessionId: sessionId ?? undefined, messages: requestMessages })
      if (typeof response.sessionId === 'string' && response.sessionId.trim()) {
        setSessionId(response.sessionId)
        try {
          localStorage.setItem('shieldbase:sessionId', response.sessionId)
        } catch {
          // Ignore storage access errors.
        }
      }
      setMeta(response.meta ?? null)
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: 'assistant',
          content: response.content,
        },
      ])

      if (response.meta?.resetSession) {
        try {
          localStorage.removeItem('shieldbase:sessionId')
        } catch {
          // Ignore storage access errors.
        }
        setSessionId(null)
        setMeta(null)
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Something went wrong while contacting support.'
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'assistant', content: `Error: ${message}` },
      ])
    } finally {
      setBusy(false)
    }
  }

  async function clearQuote() {
    if (busy || welcomeLoading) return
    if (!sessionId) {
      setMeta(null)
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'assistant', content: 'Quote cleared.' },
      ])
      return
    }

    setBusy(true)
    setBusyLabel('ShieldBase is clearing your quote…')
    try {
      const response = await postClearQuote({ sessionId })
      setMeta(response.meta ?? null)
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'assistant', content: response.content },
      ])
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Something went wrong while clearing the quote.'
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'assistant', content: `Error: ${message}` },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="shieldbase-canvas shieldbase-grain h-full min-h-0 overflow-hidden text-foreground"
      role="region"
      aria-labelledby={titleId}
    >
      <div className="flex h-full min-h-0">
        {/* Sidebar — desktop; height locked to viewport, does not scroll */}
        <aside className="relative z-10 hidden h-full min-h-0 w-[17rem] shrink-0 flex-col overflow-hidden border-r border-sidebar-border/70 bg-sidebar/90 py-7 pl-5 pr-4 shadow-[4px_0_24px_-12px_oklch(0_0_0/0.4)] backdrop-blur-xl md:flex">
          <div className="flex shrink-0 items-start gap-3">
            <div className="rounded-xl bg-sidebar-accent/80 p-2 ring-1 ring-sidebar-border/60">
              <ShieldMark className="size-9" />
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="font-serif text-xl font-semibold tracking-tight text-sidebar-foreground">
                ShieldBase
              </p>
              <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                Insurance
              </p>
            </div>
          </div>

          <Separator className="my-6 shrink-0 bg-sidebar-border/80" />

          <nav
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden"
            aria-label="Support areas"
          >
            <NavItem icon={MessageCircle} label="AI chat" active />
            <NavItem icon={Car} label="Auto (ShieldDrive)" />
            <NavItem icon={Home} label="Home (ShieldHome)" />
            <NavItem icon={HeartHandshake} label="Life (ShieldTerm)" />
            <NavItem icon={FileText} label="Policy documents" />
          </nav>

          <div className="mt-auto shrink-0 space-y-3 pt-8">
            <Card className="border-sidebar-border/80 bg-sidebar-accent/40 shadow-none">
              <CardHeader className="gap-1 px-4 py-3">
                <CardTitle className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Disclaimer
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed text-sidebar-foreground/85">
                  Information here is general reference—not a substitute for your
                  policy documents or advice from a licensed professional.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </aside>

        {/* Main chat column: header + scrollable thread + composer */}
        <div className="relative z-0 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-card/35 px-4 py-3 backdrop-blur-md md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex md:hidden">
                <div className="rounded-lg bg-secondary/80 p-1.5 ring-1 ring-border/60">
                  <ShieldMark className="size-7" />
                </div>
              </div>
              <div className="min-w-0">
                <h1
                  id={titleId}
                  className="truncate font-serif text-lg font-semibold tracking-tight md:text-xl"
                >
                  AI support
                </h1>
                <p className="truncate text-xs text-muted-foreground md:text-sm">
                  Coverage questions, claims guidance, and plan comparisons
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {meta?.mode === 'quotation' ? (
                <Badge
                  variant="secondary"
                  className="hidden border border-accent/35 bg-accent/15 font-medium text-accent-foreground sm:inline-flex"
                >
                  Quote flow
                </Badge>
              ) : null}
              <Badge
                variant="secondary"
                className="hidden border border-primary/25 bg-primary/15 font-medium text-primary sm:inline-flex"
              >
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                Online
              </Badge>
              {meta?.mode === 'quotation' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="hidden h-8 px-3 text-xs sm:inline-flex"
                  onClick={() => send('start over')}
                  disabled={busy || welcomeLoading}
                >
                  Start over
                </Button>
              ) : null}
              {meta?.mode === 'quotation' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="hidden h-8 px-3 text-xs sm:inline-flex"
                  onClick={clearQuote}
                  disabled={busy || welcomeLoading}
                >
                  Clear quote
                </Button>
              ) : null}
            </div>
          </header>

          <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]]:scroll-smooth">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
              {meta?.quote ? (
                <Card className="message-enter border-border/70 bg-card/55 shadow-sm backdrop-blur-sm">
                  <CardHeader className="gap-1">
                    <CardTitle className="font-serif text-base">
                      Quote progress
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {meta.quote.product ? (
                        <span className="font-medium capitalize">
                          {meta.quote.product}
                        </span>
                      ) : (
                        <span className="font-medium">Choosing a product</span>
                      )}{' '}
                      · step <span className="font-mono text-xs">{meta.quote.step}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {meta.quote.missingFields?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {meta.quote.missingFields.slice(0, 6).map((f) => (
                          <Badge key={f} variant="outline" className="text-xs">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No missing fields detected.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : null}
              <Card className="message-enter gap-0 overflow-hidden border-border/70 bg-card/60 py-0 shadow-md backdrop-blur-sm">
                <CardHeader className="gap-2 border-b border-border/50 bg-gradient-to-br from-primary/10 via-transparent to-accent/5 pt-6 pb-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="size-4" aria-hidden />
                    <span className="text-xs font-semibold tracking-wide uppercase">
                      Quick start
                    </span>
                  </div>
                  <CardTitle className="font-serif text-xl">
                    Ask in plain language
                  </CardTitle>
                  <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                    Try a suggestion below or describe your situation. The
                    assistant answers from the ShieldBase knowledge base and can
                    walk you through quotes for auto, home, or life.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pt-5 pb-6">
                  {SUGGESTIONS.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto rounded-full border-dashed border-border/90 bg-background/40 px-3 py-1.5 text-left text-xs font-normal whitespace-normal text-foreground shadow-none hover:border-primary/40 hover:bg-primary/5"
                      onClick={() => send(s)}
                      disabled={busy || welcomeLoading}
                    >
                      {s}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <ul className="flex flex-col gap-4" aria-live="polite">
                {messages.map((msg) => (
                  <li key={msg.id} className="message-enter">
                    <MessageRow message={msg} />
                  </li>
                ))}
              </ul>

              {welcomeLoading ? (
                <div
                  className="message-enter flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
                  aria-busy
                >
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-primary"
                    aria-hidden
                  />
                  <span>Loading welcome…</span>
                </div>
              ) : null}

              {busy ? (
                <div
                  className="message-enter flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
                  aria-busy
                >
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-primary"
                    aria-hidden
                  />
                  <span>{busyLabel}</span>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border/80 bg-card/40 p-4 backdrop-blur-md md:p-5">
            <form
              className="mx-auto flex max-w-3xl flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                send(draft)
              }}
            >
              <label htmlFor="chat-input" className="sr-only">
                Message
              </label>
              <div className="relative rounded-xl border border-border/80 bg-background/55 p-2 shadow-inner ring-1 ring-black/5 dark:ring-white/5">
                <Textarea
                  id="chat-input"
                  rows={2}
                  placeholder="e.g. What’s covered under Comprehensive auto?"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send(draft)
                    }
                  }}
                  disabled={busy || welcomeLoading}
                  className="min-h-[4.5rem] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 md:text-[0.9375rem]"
                />
                <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-2">
                  <p className="text-[0.6875rem] text-muted-foreground">
                    <kbd className="rounded border border-border bg-muted/50 px-1 py-px font-mono text-[0.625rem]">
                      Enter
                    </kbd>{' '}
                    send ·{' '}
                    <kbd className="rounded border border-border bg-muted/50 px-1 py-px font-mono text-[0.625rem]">
                      Shift+Enter
                    </kbd>{' '}
                    newline
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || welcomeLoading || !draft.trim()}
                    className="gap-1.5 rounded-lg font-semibold shadow-md shadow-primary/15"
                  >
                    Send
                    <SendHorizontal className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function NavItem({
  icon: Icon,
  label,
  active,
}: {
  icon: typeof MessageCircle
  label: string
  active?: boolean
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      disabled={!active}
      className={cn(
        'h-10 w-full justify-start gap-3 px-3 font-normal',
        active
          ? 'bg-sidebar-primary/15 text-sidebar-foreground hover:bg-sidebar-primary/20'
          : 'text-muted-foreground opacity-60',
      )}
    >
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate text-sm">{label}</span>
    </Button>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex w-full">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px] text-xs">
        {active
          ? 'You are here. Other channels are not wired up in this chat experience yet.'
          : 'Coming soon in a full product build.'}
      </TooltipContent>
    </Tooltip>
  )
}

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      <Avatar
        className={cn(
          'mt-0.5 ring-2 ring-background',
          isUser ? 'bg-accent/25' : 'bg-primary/20',
        )}
      >
        <AvatarFallback
          className={cn(
            'font-serif text-xs font-semibold',
            isUser ? 'text-accent-foreground' : 'text-primary',
          )}
        >
          {isUser ? 'You' : 'SB'}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'max-w-[min(100%,34rem)] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'border-accent/25 bg-accent/12 text-foreground'
            : 'border-border/70 bg-card/70 text-card-foreground backdrop-blur-sm',
        )}
      >
        <MessageBody text={message.content} />
      </div>
    </div>
  )
}

function MessageBody({ text }: { text: string }) {
  return <div className="markdown-body">{renderMarkdown(text)}</div>
}
