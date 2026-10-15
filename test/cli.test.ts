import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { run } from "../src/main.js";
import { baseEnv, makeLog, tempHome } from "./helpers.js";

function capture(): { stdout: string[]; stderr: string[]; io: { stdout: (s: string) => void; stderr: (s: string) => void } } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (chunk) => stdout.push(chunk),
      stderr: (chunk) => stderr.push(chunk),
    },
  };
}

describe("cli", () => {
  it("prints help and version", async () => {
    const help = capture();
    assert.equal(await run(["--help"], help.io), 0);
    const helpText = help.stdout.join("");
    assert.match(helpText, /ctxtrim shrink/);
    assert.match(helpText, /ctxtrim serve/);
    assert.match(helpText, /Powered by AtmoRouter \(https:\/\/atmorouter\.dev\)/);
    assert.match(
      helpText,
      /Concept inspired by context-mode \(https:\/\/github\.com\/mksglu\/context-mode\); not affiliated\./,
    );

    const version = capture();
    assert.equal(await run(["--version"], version.io), 0);
    assert.match(version.stdout.join(""), /^ctxtrim \d+\.\d+\.\d+/);
  });

  it("shrinks a file offline and writes the receipt to stderr", async () => {
    const { dir, cleanup } = await tempHome();
    const scratch = await mkdtemp(join(tmpdir(), "ctxtrim-file-"));
    try {
      const file = join(scratch, "build.log");
      await writeFile(file, makeLog());
      const cap = capture();
      const code = await run(["shrink", file, "--kind", "log", "--offline", "--session", "ci"], {
        ...cap.io,
        env: baseEnv(dir),
      });
      assert.equal(code, 0);
      assert.match(cap.stdout.join(""), /db connection reset/);
      assert.match(cap.stderr.join(""), /ctxtrim · log · press/);
      const recall = capture();
      assert.equal(await run(["recall", "--session", "ci"], { ...recall.io, env: baseEnv(dir) }), 0);
      assert.match(recall.stdout.join(""), /shrinks 1/);
    } finally {
      await cleanup();
      await rm(scratch, { recursive: true, force: true });
    }
  });

  it("round-trips notes", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      const env = baseEnv(dir);
      const added = capture();
      const code = await run(["note", "add", "--session", "feature-auth", "--tag", "decision", "retry with jitter"], {
        ...added.io,
        env,
      });
      assert.equal(code, 0);
      assert.match(added.stdout.join(""), /saved [0-9a-f]+ · feature-auth/);

      const listed = capture();
      assert.equal(await run(["note", "list", "--session", "feature-auth"], { ...listed.io, env }), 0);
      assert.match(listed.stdout.join(""), /retry with jitter \[decision\]/);

      const cleared = capture();
      assert.equal(await run(["note", "clear", "--session", "feature-auth"], { ...cleared.io, env }), 0);
      const after = capture();
      assert.equal(await run(["note", "list", "--session", "feature-auth"], { ...after.io, env }), 0);
      assert.match(after.stdout.join(""), /\(none\)/);
    } finally {
      await cleanup();
    }
  });

  it("returns exit code 2 when a gloss is required and no key is set", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      const cap = capture();
      const code = await run(["shrink", "--gloss", "--kind", "generic"], {
        ...cap.io,
        stdin: "hello ".repeat(80),
        env: baseEnv(dir),
      });
      assert.equal(code, 2);
      assert.match(cap.stderr.join(""), /CTXTRIM_API_KEY/);
    } finally {
      await cleanup();
    }
  });

  it("fails clearly on a missing file and an unknown command", async () => {
    const missing = capture();
    assert.equal(await run(["shrink", "does-not-exist.log", "--offline"], { ...missing.io, env: baseEnv("/tmp") }), 1);
    assert.match(missing.stderr.join(""), /File not found/);

    const unknown = capture();
    assert.equal(await run(["frobnicate"], unknown.io), 1);
    assert.match(unknown.stderr.join(""), /Unknown command/);
  });
});
