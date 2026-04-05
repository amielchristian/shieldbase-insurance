declare module 'widget' {
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

  export function mount(target: HTMLElement | string, options?: WidgetOptions): WidgetHandle
  export function unmount(target: HTMLElement | string): void
}
