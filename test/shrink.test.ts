import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CtxtrimError } from "../src/errors.js";
import { shrink } from "../src/shrink.js";
import { makeLog } from "./helpers.js";
import { baseEnv, tempHome } from "./helpers.js";

describe("shrink", () => {
  it("passes small text through after stripping ANSI", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      const result = await shrink("\u001b[32mok\u001b[0m", {
        env: baseEnv(dir),
        offline: true,
      });
      assert.equal(result.text, "ok");
      assert.equal(result.receipt.method, "passthrough");
      assert.equal(result.receipt.bytesOut < result.receipt.bytesIn, true);
    } finally {
      await cleanup();
    }
  });

  it("presses a large log offline and does not call the network", async () => {
    const { dir, cleanup } = await tempHome();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error("should not be called");
    };
    try {
      const result = await shrink(makeLog(), {
        env: baseEnv(dir),
        kind: "log",
        offline: true,
        fetch: fetchImpl,
      });
      assert.equal(result.receipt.method, "press");
      assert.equal(result.receipt.kind, "log");
      assert.match(result.text, /db connection reset/);
      assert.ok(result.receipt.bytesOut < result.receipt.bytesIn);
      assert.equal(calls, 0);
    } finally {
      await cleanup();
    }
  });

  it("glosses with the configured model and then reuses the cache", async () => {
    const { dir, cleanup } = await tempHome();
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      seen.push(body.model);
      return new Response(JSON.stringify({ choices: [{ message: { content: "FAIL auth timeout at refresh" } }] }), {
        status: 200,
      });
    };
    const env = baseEnv(dir, {
      CTXTRIM_API_KEY: "test-key",
      CTXTRIM_GLOSS_THRESHOLD: "80",
      CTXTRIM_PASSTHROUGH_CHARS: "40",
    });
    const content = `${"INFO worker tick\n".repeat(30)}ERROR db connection reset`;
    try {
      const first = await shrink(content, { env, fetch: fetchImpl, kind: "log", label: "db", gloss: true });
      const second = await shrink(content, { env, fetch: fetchImpl, kind: "log", label: "db", gloss: true });
      assert.equal(first.receipt.method, "gloss");
      assert.equal(first.receipt.model, "zai/glm-5.3");
      assert.equal(first.text, "FAIL auth timeout at refresh");
      assert.equal(second.receipt.method, "cache");
      assert.deepEqual(seen, ["zai/glm-5.3"]);
    } finally {
      await cleanup();
    }
  });

  it("falls back to the press when the provider fails", async () => {
    const { dir, cleanup } = await tempHome();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 });
    try {
      const result = await shrink(makeLog(), {
        env: baseEnv(dir, { CTXTRIM_API_KEY: "test-key", CTXTRIM_GLOSS_THRESHOLD: "100" }),
        fetch: fetchImpl,
        kind: "log",
      });
      assert.equal(result.receipt.method, "press");
      assert.match(result.receipt.warning ?? "", /overloaded/);
      assert.match(result.text, /db connection reset/);
    } finally {
      await cleanup();
    }
  });

  it("keeps the press when the gloss is not shorter", async () => {
    const { dir, cleanup } = await tempHome();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "x".repeat(5000) } }] }), { status: 200 });
    try {
      const result = await shrink("hello ".repeat(80), {
        env: baseEnv(dir, { CTXTRIM_API_KEY: "test-key" }),
        fetch: fetchImpl,
        gloss: true,
        kind: "generic",
      });
      assert.equal(result.receipt.method, "press");
      assert.match(result.receipt.warning ?? "", /not shorter/);
    } finally {
      await cleanup();
    }
  });

  it("refuses a forced gloss when no API key is set", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      await assert.rejects(
        () => shrink("hello ".repeat(80), { env: baseEnv(dir), gloss: true }),
        (err: unknown) => err instanceof CtxtrimError && err.code === "NO_API_KEY",
      );
    } finally {
      await cleanup();
    }
  });

  it("does not expand binary input", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      const result = await shrink(`prefix\0${"x".repeat(100)}`, { env: baseEnv(dir), offline: true });
      assert.match(result.text, /binary input/);
      assert.equal(result.receipt.method, "press");
    } finally {
      await cleanup();
    }
  });
});
