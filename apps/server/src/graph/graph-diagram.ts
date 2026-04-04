import { compiledChatGraph } from "./chat-graph.js";

const MERMAID_CDN_VERSION = "11.4.1";

/**
 * Mermaid source derived from the compiled LangGraph via
 * `compiledChatGraph.getGraphAsync()` → `Graph.drawMermaid()` (@langchain/core).
 */
async function getChatGraphMermaidSource(): Promise<string> {
  const drawable = await compiledChatGraph.getGraphAsync();
  return drawable.drawMermaid({ withStyles: true });
}

/** Self-contained HTML that renders the programmatic diagram in the browser via Mermaid CDN. */
export async function getChatGraphDiagramHtml(): Promise<string> {
  const mermaidSource = await getChatGraphMermaidSource();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ShieldBase chat graph</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.45; }
    h1 { font-size: 1.35rem; font-weight: 600; }
    h2 { font-size: 0.95rem; font-weight: 600; margin: 2rem 0 0.75rem; color: #666; }
    @media (prefers-color-scheme: dark) { h2 { color: #aaa; } }
    .mermaid { max-width: 100%; overflow-x: auto; padding: 1rem; border-radius: 8px; border: 1px solid #e5e5e5; background: #fff; }
    @media (prefers-color-scheme: dark) {
      .mermaid { border-color: #333; background: #1a1a1a; }
    }
    p.note { font-size: 0.875rem; color: #666; max-width: 48rem; }
    @media (prefers-color-scheme: dark) { p.note { color: #999; } }
  </style>
</head>
<body>
  <h1>LangGraph: chat graph</h1>
  <p class="note">
    Diagram generated at request time from
    <code>compiledChatGraph.getGraphAsync()</code> and
    <code>drawMermaid()</code> (see <code>apps/server/src/graph/graph-diagram.ts</code>).
    <code>CHAT_SYSTEM_PROMPT</code> is prepended in <code>invokeChatGraph</code> before <code>invoke</code>, not inside the <code>model</code> node, so it does not appear in this graph view.
  </p>
  <h2>Graph structure</h2>
  <div class="mermaid">${mermaidSource}</div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_CDN_VERSION}/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "strict" });
  </script>
</body>
</html>`;
}
