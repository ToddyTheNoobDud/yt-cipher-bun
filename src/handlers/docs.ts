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
        --bg: #0f1220;
        --panel: #171b2e;
        --panel-soft: #1f2540;
        --text: #e8ecff;
        --muted: #9aa6d1;
        --accent: #7aa2ff;
        --ok: #4ade80;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, Segoe UI, system-ui, -apple-system, sans-serif;
        background: radial-gradient(circle at top, #1b2250, var(--bg) 45%);
        color: var(--text);
      }
      .wrap {
        max-width: 980px;
        margin: 0 auto;
        padding: 2rem 1rem 3rem;
      }
      h1 {
        margin: 0;
        font-size: clamp(1.5rem, 3vw, 2.3rem);
      }
      .sub {
        color: var(--muted);
        margin: 0.5rem 0 1.5rem;
      }
      .badge {
        display: inline-block;
        border: 1px solid #3350ad;
        background: #1b2b64;
        color: #c7d4ff;
        border-radius: 999px;
        font-size: 0.8rem;
        padding: 0.2rem 0.6rem;
        margin-bottom: 1rem;
      }
      .endpoint {
        background: linear-gradient(180deg, var(--panel), var(--panel-soft));
        border: 1px solid #2e3867;
        border-radius: 12px;
        padding: 1rem;
        margin: 1rem 0;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.6rem;
      }
      .method {
        color: #052e16;
        background: var(--ok);
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 700;
        padding: 0.12rem 0.5rem;
      }
      .path {
        font-family: Consolas, Menlo, Monaco, monospace;
        font-size: 0.95rem;
      }
      .desc {
        color: var(--muted);
        margin: 0.6rem 0 0.8rem;
      }
      pre {
        margin: 0.5rem 0 0;
        padding: 0.8rem;
        border-radius: 8px;
        background: #0b1020;
        border: 1px solid #27305c;
        overflow: auto;
        font-size: 0.85rem;
        line-height: 1.5;
      }
      code { font-family: Consolas, Menlo, Monaco, monospace; }
      .footer {
        margin-top: 1.4rem;
        color: var(--muted);
        font-size: 0.9rem;
      }
      a { color: var(--accent); }
    </style>
  </head>
  <body>
    <main class="wrap">
      <span class="badge">yt-cipher-bun</span>
      <h1>API is online ✅</h1>
      <p class="sub">Use the endpoints below with <code>POST</code> and JSON body.</p>

      <section class="endpoint">
        <div class="row">
          <span class="method">POST</span>
          <span class="path">/decrypt_signature</span>
        </div>
        <p class="desc">Decrypts signature and optional <code>n</code> parameter.</p>
        <pre><code>{
  "encrypted_signature": "string",
  "n_param": "string",
  "player_url": "string"
}</code></pre>
        <pre><code>{
  "decrypted_signature": "string",
  "decrypted_n_sig": "string"
}</code></pre>
      </section>

      <section class="endpoint">
        <div class="row">
          <span class="method">POST</span>
          <span class="path">/get_sts</span>
        </div>
        <p class="desc">Extracts STS (signature timestamp) from the player script.</p>
        <pre><code>{
  "player_url": "string"
}</code></pre>
        <pre><code>{
  "sts": "string"
}</code></pre>
      </section>

      <section class="endpoint">
        <div class="row">
          <span class="method">POST</span>
          <span class="path">/resolve_url</span>
        </div>
        <p class="desc">Resolves final stream URL by decrypting signature and/or <code>n</code>.</p>
        <pre><code>{
  "stream_url": "string",
  "player_url": "string",
  "encrypted_signature": "string",
  "signature_key": "string",
  "n_param": "string"
}</code></pre>
        <pre><code>{
  "resolved_url": "string"
}</code></pre>
      </section>

      <p class="footer">
        Tip: if API token is enabled, send <code>authorization: &lt;token&gt;</code> header on API calls.
      </p>
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
