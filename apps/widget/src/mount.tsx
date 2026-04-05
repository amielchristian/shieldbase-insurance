import { createRoot, type Root } from 'react-dom/client'
import stylesText from './widget.css?inline'
import { ShieldBaseWidget } from './components/shieldbase-widget'

export type WidgetOptions = {
  apiBaseUrl?: string
  storageKey?: string
  title?: string
  brandIconUrl?: string
  useShadowDom?: boolean
}

export type WidgetHandle = {
  unmount: () => void
  rootElement: HTMLElement
  shadowRoot: ShadowRoot | null
}

type Mounted = {
  root: Root
  rootElement: HTMLElement
}

const mounted = new WeakMap<HTMLElement, Mounted>()

function resolveTarget(target: HTMLElement | string): HTMLElement {
  if (typeof target !== 'string') return target
  const el = document.querySelector<HTMLElement>(target)
  if (!el) throw new Error(`Widget mount target not found: ${target}`)
  return el
}

function ensureStyles(container: Document | ShadowRoot) {
  const existing = container.querySelector('style[data-shieldbase-widget]') as HTMLStyleElement | null
  if (existing) return
  const style = document.createElement('style')
  style.setAttribute('data-shieldbase-widget', 'true')
  style.textContent = stylesText
  container.appendChild(style)
}

export function mount(target: HTMLElement | string, options: WidgetOptions = {}): WidgetHandle {
  const host = resolveTarget(target)
  if (mounted.has(host)) {
    throw new Error('Widget is already mounted on this element.')
  }

  const useShadowDom = options.useShadowDom ?? true
  let shadowRoot: ShadowRoot | null = null
  let rootElement: HTMLElement

  if (useShadowDom) {
    shadowRoot = host.attachShadow({ mode: 'open' })
    ensureStyles(shadowRoot)
    rootElement = document.createElement('div')
    shadowRoot.appendChild(rootElement)
  } else {
    ensureStyles(document)
    rootElement = document.createElement('div')
    host.appendChild(rootElement)
  }

  const root = createRoot(rootElement)
  root.render(
    <ShieldBaseWidget
      apiBaseUrl={options.apiBaseUrl}
      storageKey={options.storageKey}
      title={options.title}
      brandIconUrl={options.brandIconUrl}
    />,
  )

  mounted.set(host, { root, rootElement })

  return {
    rootElement,
    shadowRoot,
    unmount: () => unmount(host),
  }
}

export function unmount(target: HTMLElement | string) {
  const host = resolveTarget(target)
  const entry = mounted.get(host)
  if (!entry) return
  entry.root.unmount()
  entry.rootElement.remove()
  mounted.delete(host)
}
