# ShieldBase Widget

Embeddable, minimal chat widget for ShieldBase Insurance.

## Dev

```bash
pnpm --filter widget dev
```

## Build (embeddable bundles)

```bash
pnpm --filter widget build
```

This produces:

- `dist/iife/shieldbase-widget.js` (drop-in `<script>` build; exposes `ShieldBaseWidget`)
- `dist/esm/shieldbase-widget.js` (ES module build)

## Embed (vanilla HTML)

```html
<div id="shieldbase-widget" style="height: 560px;"></div>
<script src="/path/to/shieldbase-widget.js"></script>
<script>
  ShieldBaseWidget.mount("#shieldbase-widget", { apiBaseUrl: "http://localhost:3001" });
<\/script>
```

