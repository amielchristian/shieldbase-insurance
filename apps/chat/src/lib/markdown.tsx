import type { ReactNode } from 'react'

type MdBlock =
  | { type: 'p'; text: string }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; lang: string | null; text: string }
  | { type: 'hr' }

function normalize(md: string) {
  return md.replace(/\r\n/g, '\n').replace(/\t/g, '  ').trimEnd()
}

function parseBlocks(md: string): MdBlock[] {
  const lines = normalize(md).split('\n')
  const blocks: MdBlock[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''

    // Skip blank lines
    if (!line.trim()) {
      i += 1
      continue
    }

    // Fenced code block
    const fence = line.match(/^```(\w+)?\s*$/)
    if (fence) {
      const lang = fence[1] ? fence[1].trim() : null
      i += 1
      const buf: string[] = []
      while (i < lines.length) {
        const l = lines[i] ?? ''
        if (/^```\s*$/.test(l)) {
          i += 1
          break
        }
        buf.push(l)
        i += 1
      }
      blocks.push({ type: 'code', lang, text: buf.join('\n') })
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    // Headings (cap at h3 for chat)
    const heading = line.match(/^(#{1,3})\s+(.+)\s*$/)
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3
      blocks.push({ type: 'heading', level, text: heading[2]!.trim() })
      i += 1
      continue
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i] ?? ''
        const m = l.match(/^\s*[-*+]\s+(.+)\s*$/)
        if (!m) break
        items.push(m[1]!.trim())
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i] ?? ''
        const m = l.match(/^\s*\d+\.\s+(.+)\s*$/)
        if (!m) break
        items.push(m[1]!.trim())
        i += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    // Paragraph (collect until blank line or a new block starts)
    const buf: string[] = [line]
    i += 1
    while (i < lines.length) {
      const l = lines[i] ?? ''
      if (!l.trim()) break
      if (/^```/.test(l)) break
      if (/^(-{3,}|\*{3,})\s*$/.test(l.trim())) break
      if (/^(#{1,3})\s+/.test(l)) break
      if (/^\s*[-*+]\s+/.test(l)) break
      if (/^\s*\d+\.\s+/.test(l)) break
      buf.push(l)
      i += 1
    }
    blocks.push({ type: 'p', text: buf.join('\n').trimEnd() })
  }

  return blocks
}

type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string }

function findNext(text: string) {
  const idxs = [
    { kind: 'code' as const, idx: text.indexOf('`') },
    { kind: 'bold' as const, idx: text.indexOf('**') },
    { kind: 'italic' as const, idx: text.indexOf('*') },
    { kind: 'link' as const, idx: text.indexOf('[') },
  ].filter((x) => x.idx >= 0)

  if (!idxs.length) return null
  idxs.sort((a, b) => a.idx - b.idx)
  return idxs[0]!
}

function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = []
  let s = text

  while (s.length) {
    const next = findNext(s)
    if (!next) {
      out.push({ type: 'text', text: s })
      break
    }

    if (next.idx > 0) {
      out.push({ type: 'text', text: s.slice(0, next.idx) })
      s = s.slice(next.idx)
      continue
    }

    if (next.kind === 'code') {
      const end = s.indexOf('`', 1)
      if (end > 0) {
        out.push({ type: 'code', text: s.slice(1, end) })
        s = s.slice(end + 1)
        continue
      }
    }

    if (next.kind === 'bold' && s.startsWith('**')) {
      const end = s.indexOf('**', 2)
      if (end > 1) {
        out.push({ type: 'strong', text: s.slice(2, end) })
        s = s.slice(end + 2)
        continue
      }
    }

    if (next.kind === 'italic' && s.startsWith('*') && !s.startsWith('**')) {
      const end = s.indexOf('*', 1)
      if (end > 0) {
        out.push({ type: 'em', text: s.slice(1, end) })
        s = s.slice(end + 1)
        continue
      }
    }

    if (next.kind === 'link' && s.startsWith('[')) {
      const closeText = s.indexOf(']')
      const openHref = closeText >= 0 ? s.indexOf('(', closeText) : -1
      const closeHref = openHref >= 0 ? s.indexOf(')', openHref) : -1
      if (closeText > 0 && openHref === closeText + 1 && closeHref > openHref + 1) {
        const label = s.slice(1, closeText)
        const href = s.slice(openHref + 1, closeHref)
        out.push({ type: 'link', text: label, href })
        s = s.slice(closeHref + 1)
        continue
      }
    }

    // If parsing fails, consume one character to avoid infinite loops.
    out.push({ type: 'text', text: s.slice(0, 1) })
    s = s.slice(1)
  }

  return out
}

function renderInline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((t, idx) => {
    if (t.type === 'text') return <span key={idx}>{t.text}</span>
    if (t.type === 'strong') return <strong key={idx} className="font-semibold">{t.text}</strong>
    if (t.type === 'em') return <em key={idx} className="italic">{t.text}</em>
    if (t.type === 'code') {
      return (
        <code
          key={idx}
          className="rounded-md border border-border/70 bg-muted/40 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {t.text}
        </code>
      )
    }
    // link
    return (
      <a
        key={idx}
        href={t.href}
        target="_blank"
        rel="noreferrer noopener"
        className="underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
      >
        {t.text}
      </a>
    )
  })
}

function renderParagraph(text: string): ReactNode {
  const lines = text.split('\n')
  return (
    <p className="whitespace-pre-wrap">
      {lines.map((line, i) => {
        const nodes = renderInline(parseInline(line))
        if (i === lines.length - 1) return <span key={i}>{nodes}</span>
        return (
          <span key={i}>
            {nodes}
            <br />
          </span>
        )
      })}
    </p>
  )
}

export function renderMarkdown(md: string): ReactNode {
  const blocks = parseBlocks(md)
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.type === 'hr') {
          return <hr key={i} className="border-border/60" />
        }
        if (b.type === 'heading') {
          const cls =
            b.level === 1
              ? 'font-serif text-base font-semibold'
              : b.level === 2
                ? 'font-serif text-sm font-semibold'
                : 'text-sm font-semibold'
          return (
            <div key={i} className={cls}>
              {renderInline(parseInline(b.text))}
            </div>
          )
        }
        if (b.type === 'code') {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-3 font-mono text-[0.8125rem] leading-relaxed"
            >
              <code>{b.text}</code>
            </pre>
          )
        }
        if (b.type === 'ul') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(parseInline(it))}</li>
              ))}
            </ul>
          )
        }
        if (b.type === 'ol') {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(parseInline(it))}</li>
              ))}
            </ol>
          )
        }
        return <div key={i}>{renderParagraph(b.text)}</div>
      })}
    </div>
  )
}

