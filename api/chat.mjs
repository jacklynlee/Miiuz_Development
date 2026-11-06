/* Miiuz Beyond Borders — POST /api/chat: the Miiuz assistant on the Claude API.
 *
 * The browser keeps the conversation and sends it back in full each turn; this
 * function adds the fixed system prompt and tools, streams Claude's answer as
 * Server-Sent Events, and returns the finished assistant turn for the browser to
 * append. The page runs the update_plan tool itself and sends the result back as
 * the next turn. Requires ANTHROPIC_API_KEY. GET reports whether it is configured. */
import { Anthropic, COUNTRY, PROMPT, MODEL, MAX_BODY_BYTES, anthropic, configured, errorCode, originAllowed, rateLimiter, readJson, sendJson, tooOld } from "./_shared.mjs";

const MAX_MESSAGES = 60;
const limited = rateLimiter(Number(process.env.MIIUZ_RATE_LIMIT || 40));

// Fixed for the life of every conversation: Claude's reasoning blocks are bound to
// the exact system prompt and tool set they were produced under.
const SYSTEM = PROMPT.buildSystem(COUNTRY, "server");
const TOOLS = [
  { ...PROMPT.planTool, eager_input_streaming: true },
  { type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "MY", timezone: COUNTRY.timezone } },
];

// Only user/assistant turns, starting and ending with the traveller.
function validMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return false;
  if (messages[0].role !== "user" || messages[messages.length - 1].role !== "user") return false;
  return messages.every(m =>
    m && (m.role === "user" || m.role === "assistant") &&
    (typeof m.content === "string" || (Array.isArray(m.content) && m.content.length > 0 && m.content.every(b => b && typeof b.type === "string"))) &&
    (m.role !== "user" || typeof m.content === "string" || m.content.every(b => b.type === "text" || b.type === "tool_result")));
}

// After a mid-answer fallback to another model, blocks the declined model wrote
// before the switch (other than text and completed searches) must not be replayed.
function echoContent(content) {
  const cut = content.map(b => b.type).lastIndexOf("fallback");
  if (cut < 0) return content;
  const answered = new Set(content.filter(b => b.type === "web_search_tool_result").map(b => b.tool_use_id));
  return content.filter((b, i) =>
    i >= cut || b.type === "text" || b.type === "web_search_tool_result" || (b.type === "server_tool_use" && answered.has(b.id)));
}

function sourcesOf(content) {
  const seen = new Map();
  for (const b of content) {
    if (b.type !== "text" || !Array.isArray(b.citations)) continue;
    for (const c of b.citations) if (c.url && !seen.has(c.url)) seen.set(c.url, { url: c.url, title: c.title || "" });
  }
  return [...seen.values()];
}

export default async function handler(req, res) {
  if (tooOld(req)) return sendJson(res, 426, { code: "update" }); // the app shows "Please update" (#30)
  if (req.method === "GET") return sendJson(res, 200, { ok: true, configured: configured(), web: true });
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return sendJson(res, 405, { code: "method_not_allowed" }); }
  if (!configured()) return sendJson(res, 503, { code: "not_configured" });
  if (!originAllowed(req)) return sendJson(res, 403, { code: "forbidden" });
  if (limited(req)) return sendJson(res, 429, { code: "rate_limited" });

  let body;
  try { body = await readJson(req); } catch (e) { return sendJson(res, e.code === "too_long" ? 413 : 400, { code: e.code === "too_long" ? "too_long" : "bad_request" }); }
  const messages = body?.messages;
  if (!validMessages(messages)) return sendJson(res, 400, { code: "bad_request" });
  if (Buffer.byteLength(JSON.stringify(messages)) > MAX_BODY_BYTES) return sendJson(res, 413, { code: "too_long" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });

  try {
    let message = null;
    // Re-issue a turn whose tool input arrived as unparseable JSON (at most twice).
    for (let attempt = 0; ; attempt++) {
      const stream = anthropic().beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
        fallbacks: "default",
        thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      }, { signal: abort.signal });

      stream.on("contentBlock", block => {
        if (block.type === "server_tool_use" && block.name === "web_search") send("status", { kind: "search", query: block.input?.query || "" });
      });

      try {
        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") send("status", { kind: "search" });
          else if (event.type === "content_block_delta" && event.delta.type === "text_delta") send("text", { text: event.delta.text });
        }
        message = await stream.finalMessage();
        break;
      } catch (err) {
        if (err instanceof Anthropic.APIError || abort.signal.aborted || attempt >= 2) throw err;
        send("restart", {});
      }
    }

    // A truncated tool call can look valid; don't hand it to the page.
    if (message.stop_reason === "max_tokens" && message.content.some(b => b.type === "tool_use")) {
      send("error", { code: "upstream" });
    } else {
      send("done", { content: echoContent(message.content), stop_reason: message.stop_reason, sources: sourcesOf(message.content) });
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error("[miiuz] chat error:", err?.status || "", err?.message || err);
      send("error", { code: errorCode(err) });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
}
