import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectKind } from "../src/kind.js";
import { press } from "../src/press.js";
import { stripAnsi } from "../src/textutil.js";
import { makeGeneric, makeLog, makeSource, makeTestOutput } from "./helpers.js";

describe("kind detection", () => {
  it("classifies logs, tests, files, json, and plain text", () => {
    assert.equal(detectKind(makeLog()), "log");
    assert.equal(detectKind(makeTestOutput()), "test");
    assert.equal(detectKind(makeSource()), "file");
    assert.equal(detectKind(JSON.stringify({ users: [{ id: 1 }] })), "file");
    assert.equal(detectKind("hello\nthis is a note about lunch\n"), "generic");
  });
});

describe("press", () => {
  it("strips ANSI color codes", () => {
    assert.equal(stripAnsi("\u001b[31mERROR\u001b[0m boom"), "ERROR boom");
  });

  it("keeps log errors and warnings, collapses repeats, and drops the quiet middle", () => {
    const output = press(makeLog(), "log");
    assert.match(output, /ready {2}×3/);
    assert.equal((output.match(/db connection reset/g) ?? []).length, 3);
    assert.match(output, /queue depth 1400/);
    assert.match(output, /omitted/);
    assert.equal(output.includes("tick 150"), false);
    assert.equal(output.includes("\u001b"), false);
    assert.ok(output.length < makeLog().length);
  });

  it("keeps test failures and the summary, and drops passing files", () => {
    const output = press(makeTestOutput(), "test");
    assert.match(output, /auth\.test\.ts:42:17/);
    assert.match(output, /AssertionError/);
    assert.match(output, /Test Files/);
    assert.match(output, /RUN  v3\.2\.0/);
    assert.equal(output.includes("ok40.test.ts"), false);
    assert.match(output, /omitted/);
    assert.ok(output.length < makeTestOutput().length);
  });

  it("outlines a long source file instead of keeping function bodies", () => {
    const output = press(makeSource(), "file");
    assert.match(output, /export function handler20/);
    assert.match(output, /import \{ readFile \}/);
    assert.equal(output.includes("body-20-unique"), false);
    assert.match(output, /omitted/);
  });

  it("describes large JSON by shape", () => {
    const users = Array.from({ length: 50 }, (_, id) => ({
      id,
      name: `user-${id}`,
      email: `u${id}@example.com`,
    }));
    const raw = JSON.stringify({ users, meta: { page: 1, total: 50 } }, null, 2);
    const output = press(raw, "file");
    assert.match(output, /^json/);
    assert.match(output, /users/);
    assert.match(output, /array\(50\)/);
    assert.match(output, /meta/);
    assert.ok(output.length < raw.length / 2);
  });

  it("keeps the head and tail of generic text", () => {
    const output = press(makeGeneric(), "generic");
    assert.match(output, /paragraph 0 /);
    assert.match(output, /paragraph 99 /);
    assert.equal(output.includes("paragraph 50 "), false);
    assert.match(output, /omitted/);
  });

  it("caps a single enormous line", () => {
    const output = press("x".repeat(20_000), "generic", { maxChars: 800 });
    assert.ok(output.length <= 800);
    assert.match(output, /chars clipped/);
  });
});
