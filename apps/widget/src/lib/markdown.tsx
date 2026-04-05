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

    if (!line.trim()) {
      i += 1
      continue
    }

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

    if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)\s*$/)
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3
      blocks.push({ type: 'heading', level, text: heading[2]!.trim() })
      i += 1
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i] ?? ''
        if (!l.trim()) {
          const next = lines[i + 1] ?? ''
          if (/^\s*[-*+]\s+/.test(next)) {
            i += 1
            continue
          }
          break
        }
        const m = l.match(/^\s*[-*+]\s+(.+)\s*$/)
        if (!m) break
        items.push(m[1]!.trim())
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i] ?? ''
        if (!l.trim()) {
          const next = lines[i + 1] ?? ''
          if (/^\s*\d+\.\s+/.test(next)) {
            i += 1
            continue
          }
          break
        }
        const m = l.match(/^\s*\d+\.\s+(.+)\s*$/)
        if (!m) break
        items.push(m[1]!.trim())
        i += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

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

    out.push({ type: 'text', text: s.slice(0, 1) })
    s = s.slice(1)
  }

  return out
}

function renderInline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((t, idx) => {
    if (t.type === 'text') return <span key={idx}>{t.text}</span>
    if (t.type === 'strong') return <strong key={idx}>{t.text}</strong>
    if (t.type === 'em') return <em key={idx}>{t.text}</em>
    if (t.type === 'code') return <code key={idx}>{t.text}</code>
    return (
      <a key={idx} href={t.href} target="_blank" rel="noreferrer noopener">
        {t.text}
      </a>
    )
  })
}

function renderParagraph(text: string): ReactNode {
  const lines = text.split('\n')
  return (
    <p>
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
    <div className="sbw-md">
      {blocks.map((b, i) => {
        if (b.type === 'hr') return <hr key={i} />
        if (b.type === 'heading') {
          const Tag: 'h3' | 'h4' | 'h5' = b.level === 1 ? 'h3' : b.level === 2 ? 'h4' : 'h5'
          return (
            <Tag key={i}>
              {renderInline(parseInline(b.text))}
            </Tag>
          )
        }
        if (b.type === 'code') {
          return (
            <pre key={i}>
              <code>{b.text}</code>
            </pre>
          )
        }
        if (b.type === 'ul') {
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(parseInline(it))}</li>
              ))}
            </ul>
          )
        }
        if (b.type === 'ol') {
          return (
            <ol key={i}>
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
