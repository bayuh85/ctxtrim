import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, loadConfig } from "../src/config.js";
import { CtxtrimError } from "../src/errors.js";
import { chatCompletionsUrl, OpenAICompatibleClient } from "../src/openai.js";

describe("config", () => {
  it("defaults to AtmoRouter and zai/glm-5.3", () => {
    const config = loadConfig({});
    assert.equal(config.baseUrl, DEFAULT_BASE_URL);
    assert.equal(config.baseUrl, "https://atmorouter.dev/v1");
    assert.equal(config.model, DEFAULT_MODEL);
    assert.equal(config.model, "zai/glm-5.3");
    assert.equal(config.apiKey, undefined);
  });

  it("reads the base URL, key, and model from the environment", () => {
    const config = loadConfig({
      CTXTRIM_BASE_URL: "http://127.0.0.1:9/v1/",
      CTXTRIM_API_KEY: " secret ",
      CTXTRIM_MODEL: " local/model ",
      CTXTRIM_PASSTHROUGH_CHARS: "nope",
    });
    assert.equal(config.baseUrl, "http://127.0.0.1:9/v1");
    assert.equal(config.apiKey, "secret");
    assert.equal(config.model, "local/model");
    assert.equal(config.passthroughChars, 2_000);
  });

  it("rejects a base URL that is not http(s)", () => {
    assert.throws(() => loadConfig({ CTXTRIM_BASE_URL: "ftp://files.example/v1" }), CtxtrimError);
  });
});

describe("OpenAI-compatible client", () => {
  it("posts chat completions to the provider base URL", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: [{ type: "text", text: "kept " }, { type: "text", text: "the failure" }] } }],
        }),
        { status: 200 },
      );
    };
    const client = new OpenAICompatibleClient({
      baseUrl: "https://example.test/v1/",
      apiKey: "test-key",
      model: "zai/glm-5.3",
      timeoutMs: 5_000,
      fetch: fetchImpl,
    });
    const text = await client.complete([{ role: "user", content: "data" }], 300);
    assert.equal(text, "kept the failure");
    assert.equal(seen[0]?.url, "https://example.test/v1/chat/completions");
    assert.equal(chatCompletionsUrl("https://atmorouter.dev/v1"), "https://atmorouter.dev/v1/chat/completions");
    const headers = new Headers(seen[0]?.init.headers);
    assert.equal(headers.get("authorization"), "Bearer test-key");
    assert.equal(headers.get("content-type"), "application/json");
    const body = JSON.parse(String(seen[0]?.init.body)) as { model: string; temperature: number; messages: unknown[] };
    assert.equal(body.model, "zai/glm-5.3");
    assert.equal(body.temperature, 0.1);
    assert.equal(body.messages.length, 1);
  });

  it("surfaces provider error messages", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 });
    const client = new OpenAICompatibleClient({
      baseUrl: "https://atmorouter.dev/v1",
      apiKey: "nope",
      model: "zai/glm-5.3",
      timeoutMs: 5_000,
      fetch: fetchImpl,
    });
    await assert.rejects(() => client.complete([{ role: "user", content: "x" }], 200), /bad key/);
  });

  it("rejects non-JSON responses", async () => {
    const fetchImpl: typeof fetch = async () => new Response("<html>down</html>", { status: 502 });
    const client = new OpenAICompatibleClient({
      baseUrl: "https://atmorouter.dev/v1",
      apiKey: "k",
      model: "zai/glm-5.3",
      timeoutMs: 5_000,
      fetch: fetchImpl,
    });
    await assert.rejects(() => client.complete([{ role: "user", content: "x" }], 200), /non-JSON/);
  });

  it("names timeouts plainly", async () => {
    const fetchImpl: typeof fetch = async () => {
      const err = new Error("The operation was aborted");
      err.name = "TimeoutError";
      throw err;
    };
    const client = new OpenAICompatibleClient({
      baseUrl: "https://atmorouter.dev/v1",
      apiKey: "k",
      model: "zai/glm-5.3",
      timeoutMs: 5_000,
      fetch: fetchImpl,
    });
    await assert.rejects(() => client.complete([{ role: "user", content: "x" }], 200), /timed out/);
  });
});
