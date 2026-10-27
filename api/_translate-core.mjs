/* Translate a batch of the app's English strings with Claude. Used by /api/translate and by
 * scripts/translate.mjs (which bundles whole languages ahead of time). */
import { anthropic, MODEL, PROMPT } from "./_shared.mjs";

const FORMAT = {
  type: "json_schema",
  schema: { type: "object", properties: { t: { type: "array", items: { type: "string" } } }, required: ["t"], additionalProperties: false },
};

export async function translateStrings(lang, strings) {
  const message = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: FORMAT },
    system: PROMPT.translateSystem(lang),
    messages: [{ role: "user", content: JSON.stringify(strings) }],
  });
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    throw Object.assign(new Error(`translation stopped: ${message.stop_reason}`), { code: "upstream" });
  }
  const text = message.content.filter(b => b.type === "text").map(b => b.text).join("");
  const out = JSON.parse(text).t;
  if (!Array.isArray(out) || out.length !== strings.length || out.some(s => typeof s !== "string")) {
    throw Object.assign(new Error("translation returned the wrong shape"), { code: "upstream" });
  }
  return out;
}
