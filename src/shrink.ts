import { createHash } from "node:crypto";
import { join } from "node:path";
import { loadConfig, type Config } from "./config.js";
import { CtxtrimError, errorText } from "./errors.js";
import { detectKind } from "./kind.js";
import { readJson, writeJson } from "./jsonstore.js";
import { glossMessages, OpenAICompatibleClient, tokenBudget } from "./openai.js";
import { press } from "./press.js";
import { looksBinary, stripAnsi } from "./textutil.js";
import type { ContentKind, ShrinkReceipt, ShrinkResult } from "./types.js";

const MAX_INPUT_CHARS = 1_500_000;

export type ShrinkOptions = {
  kind?: ContentKind | "auto";
  label?: string;
  /** Require a model summary. A missing API key is an error. */
  gloss?: boolean;
  /** Never call the provider. */
  offline?: boolean;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  config?: Config;
};

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function cacheKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex");
}

function clipLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length <= 120 ? clean : `${clean.slice(0, 119)}…`;
}

function withWarning(receipt: ShrinkReceipt, warning?: string): ShrinkReceipt {
  if (!warning) return receipt;
  return { ...receipt, warning: receipt.warning ? `${receipt.warning}; ${warning}` : warning };
}

function finish(text: string, receipt: ShrinkReceipt): ShrinkResult {
  return { text, receipt: { ...receipt, bytesOut: byteLength(text) } };
}

async function readCache(file: string): Promise<string | undefined> {
  const value = await readJson(file);
  if (!value || typeof value !== "object") return undefined;
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" && text.trim() ? text : undefined;
}

/**
 * Shrink tool output in two stages: a mechanical press, then an optional model gloss.
 * Identical glosses are reused from the local cache.
 */
export async function shrink(content: string, options: ShrinkOptions = {}): Promise<ShrinkResult> {
  if (options.gloss && options.offline) {
    throw new CtxtrimError("Choose either --gloss or --offline, not both.", "USAGE");
  }

  const config = options.config ?? loadConfig(options.env);
  const original = content ?? "";
  const bytesIn = byteLength(original);
  let source = original;
  let limitWarning: string | undefined;
  if (source.length > MAX_INPUT_CHARS) {
    source = source.slice(0, MAX_INPUT_CHARS);
    limitWarning = `input truncated to ${MAX_INPUT_CHARS} characters`;
  }

  const kind: ContentKind = options.kind && options.kind !== "auto" ? options.kind : detectKind(source);

  if (looksBinary(stripAnsi(source))) {
    const text = `[binary input · ${bytesIn} bytes · left unread]`;
    return finish(text, withWarning({ kind: "generic", method: "press", bytesIn, bytesOut: 0 }, limitWarning));
  }

  if (source.length === 0) {
    return finish("", { kind, method: "passthrough", bytesIn: 0, bytesOut: 0 });
  }

  const cleaned = stripAnsi(source).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!options.gloss && cleaned.length <= config.passthroughChars) {
    return finish(
      cleaned.trimEnd(),
      withWarning({ kind, method: "passthrough", bytesIn, bytesOut: 0 }, limitWarning),
    );
  }

  const pressed = press(cleaned, kind, { maxChars: config.pressChars });
  const shouldGloss = !options.offline && (options.gloss === true || pressed.length >= config.glossThreshold);

  if (!shouldGloss) {
    return finish(pressed, withWarning({ kind, method: "press", bytesIn, bytesOut: 0 }, limitWarning));
  }

  if (!config.apiKey) {
    if (options.gloss) {
      throw new CtxtrimError("CTXTRIM_API_KEY is not set, so ctxtrim cannot gloss this output.", "NO_API_KEY");
    }
    return finish(
      pressed,
      withWarning(
        { kind, method: "press", bytesIn, bytesOut: 0, warning: "gloss skipped: CTXTRIM_API_KEY is not set" },
        limitWarning,
      ),
    );
  }

  const label = clipLabel(options.label);
  const key = cacheKey([config.model, kind, String(config.targetChars), label ?? "", pressed]);
  const cacheFile = join(config.home, "cache", `${key}.json`);
  const cached = await readCache(cacheFile);
  if (cached) {
    return finish(
      cached,
      withWarning({ kind, method: "cache", bytesIn, bytesOut: 0, model: config.model }, limitWarning),
    );
  }

  const client = new OpenAICompatibleClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  try {
    const glossed = (
      await client.complete(
        glossMessages({
          kind,
          ...(label ? { label } : {}),
          text: pressed,
          targetChars: config.targetChars,
        }),
        tokenBudget(config.targetChars),
      )
    ).trim();

    if (!glossed) {
      return finish(
        pressed,
        withWarning(
          { kind, method: "press", bytesIn, bytesOut: 0, warning: "gloss returned an empty summary" },
          limitWarning,
        ),
      );
    }
    if (glossed.length >= pressed.length) {
      return finish(
        pressed,
        withWarning(
          { kind, method: "press", bytesIn, bytesOut: 0, warning: "gloss was not shorter than the press" },
          limitWarning,
        ),
      );
    }
    await writeJson(cacheFile, { text: glossed, model: config.model, createdAt: new Date().toISOString() });
    return finish(
      glossed,
      withWarning({ kind, method: "gloss", bytesIn, bytesOut: 0, model: config.model }, limitWarning),
    );
  } catch (err) {
    if (options.gloss) {
      throw err instanceof CtxtrimError ? err : new CtxtrimError(errorText(err), "PROVIDER");
    }
    return finish(
      pressed,
      withWarning(
        { kind, method: "press", bytesIn, bytesOut: 0, warning: `gloss failed: ${errorText(err)}` },
        limitWarning,
      ),
    );
  }
}
