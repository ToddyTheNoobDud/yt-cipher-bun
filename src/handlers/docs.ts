import { jsonResponse } from "../shared.ts";

const DOCS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>yt-cipher API</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #09090b;
        --surface: #121214;
        --border: #27272a;
        --text: #f4f4f5;
        --muted: #a1a1aa;
        --method-bg: #052e16;
        --method-text: #34d399;
        --code-bg: #000000;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        background-color: var(--bg);
        background-image: radial-gradient(ellipse 80% 50% at 50% -20%, #27272a, var(--bg));
        color: var(--text);
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
      }
      .wrap {
        max-width: 760px;
        margin: 0 auto;
        padding: 4rem 1.5rem;
      }
      header { margin-bottom: 3rem; }
      h1 {
        margin: 0;
        font-size: 2rem;
        font-weight: 600;
        letter-spacing: -0.025em;
      }
      .sub {
        color: var(--muted);
        margin: 0.5rem 0 0;
        font-size: 1.05rem;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        padding: 0.25rem 0.75rem;
        margin-bottom: 1.5rem;
      }
      .endpoint {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
      }
      .method {
        color: var(--method-text);
        background: var(--method-bg);
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        letter-spacing: 0.05em;
      }
      .path {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.95rem;
        font-weight: 500;
      }
      .desc {
        color: var(--muted);
        font-size: 0.9rem;
        margin: 0 0 1.5rem 0;
      }
      .code-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: 1fr;
      }
      @media (min-width: 640px) {
        .code-grid { grid-template-columns: 1fr 1fr; }
      }
      .code-block {
        display: flex;
        flex-direction: column;
      }
      .code-label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--muted);
        margin-bottom: 0.5rem;
        font-weight: 600;
      }
      pre {
        margin: 0;
        padding: 1rem;
        border-radius: 8px;
        background: var(--code-bg);
        border: 1px solid var(--border);
        overflow-x: auto;
        font-size: 0.85rem;
        height: 100%;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .footer {
        margin-top: 3rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 0.85rem;
        text-align: center;
      }
      .footer code {
        background: var(--surface);
        padding: 0.2rem 0.4rem;
        border-radius: 4px;
        border: 1px solid var(--border);
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <header>
        <span class="badge">yt-cipher-bun</span>
        <h1>API is online ✅</h1>
        <p class="sub">Use the endpoints below with <code>POST</code> and a JSON body.</p>
      </header>

      <section class="endpoint">
        <div class="row">
          <span class="method">POST</span>
          <span class="path">/decrypt_signature</span>
        </div>
        <p class="desc">Decrypts signature and optional <code>n</code> parameter.</p>
        <div class="code-grid">
          <div class="code-block">
            <span class="code-label">Request</span>
            <pre><code>{
  "encrypted_signature": "string",
  "n_param": "string",
  "player_url": "string"
}</code></pre>
          </div>
          <div class="code-block">
            <span class="code-label">Response</span>
            <pre><code>{
  "decrypted_signature": "string",
  "decrypted_n_sig": "string"
}</code></pre>
          </div>
        </div>
      </section>

      <section class="endpoint">
        <div class="row">
          <span class="method">POST</span>
          <span class="path">/get_sts</span>
        </div>
        <p class="desc">Extracts STS (signature timestamp) from the player script.</p>
        <div class="code-grid">
          <div class="code-block">
            <span class="code-label">Request</span>
            <pre><code>{
  "player_url": "string"
}</code></pre>
          </div>
          <div class="code-block">
            <span class="code-label">Response</span>
            <pre><code>{
  "sts": "string"
}</code></pre>
          </div>
        </div>
      </section>

      <section class="endpoint">
        <div class="row">
          <span class="method">POST</span>
          <span class="path">/resolve_url</span>
        </div>
        <p class="desc">Resolves final stream URL by decrypting signature and/or <code>n</code>.</p>
        <div class="code-grid">
          <div class="code-block">
            <span class="code-label">Request</span>
            <pre><code>{
  "stream_url": "string",
  "player_url": "string",
  "encrypted_signature": "string",
  "signature_key": "string",
  "n_param": "string"
}</code></pre>
          </div>
          <div class="code-block">
            <span class="code-label">Response</span>
            <pre><code>{
  "resolved_url": "string"
}</code></pre>
          </div>
        </div>
      </section>

      <footer class="footer">
        Tip: if API token is enabled, send <code>Authorization: &lt;token&gt;</code> header on API calls.
      </footer>
    </main>
  </body>
</html>`;

export const handleDocs = async (_req: Request): Promise<Response> =>
  new Response(DOCS_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export const handleHealth = async (_req: Request): Promise<Response> =>
  jsonResponse({ status: "ok", service: "yt-cipher-bun" });