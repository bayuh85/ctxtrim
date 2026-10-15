import assert from "node:assert/strict";
import { stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CtxtrimError } from "../src/errors.js";
import { formatRecall, Ledger } from "../src/ledger.js";
import { tempHome } from "./helpers.js";

describe("ledger", () => {
  it("stores, lists, and clears compact notes", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      const ledger = new Ledger(dir);
      const note = await ledger.add("feature-auth", "Retry token refresh with jitter.", ["Decision", "auth"]);
      const loaded = await ledger.load("feature-auth");
      assert.equal(loaded.notes.length, 1);
      assert.equal(loaded.notes[0]?.id, note.id);
      assert.deepEqual(loaded.notes[0]?.tags, ["decision", "auth"]);
      assert.match(formatRecall(loaded), /Retry token refresh/);

      const info = await stat(join(dir, "sessions", "feature-auth.json"));
      assert.equal(info.mode & 0o777, 0o600);

      await ledger.clear("feature-auth");
      const empty = await ledger.load("feature-auth");
      assert.equal(empty.notes.length, 0);
      assert.equal(empty.stats.shrinks, 0);
    } finally {
      await cleanup();
    }
  });

  it("rolls older notes into a capped digest", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      const ledger = new Ledger(dir, 80);
      await ledger.add("s", "a".repeat(40));
      await ledger.add("s", "b".repeat(40));
      await ledger.add("s", "c".repeat(40));
      const session = await ledger.load("s");
      assert.equal(session.notes.length, 2);
      assert.match(session.digest, /a{40}/);
      assert.equal(session.notes.some((note) => note.text.includes("a".repeat(40))), false);

      for (let i = 0; i < 30; i += 1) {
        await ledger.add("s", `note ${i} ${"z".repeat(30)}`);
      }
      const rolled = await ledger.load("s");
      assert.ok(rolled.digest.length <= 80);
      assert.ok(rolled.notes.reduce((sum, note) => sum + note.text.length, 0) <= 80);
    } finally {
      await cleanup();
    }
  });

  it("records shrink totals on the session", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      const ledger = new Ledger(dir);
      await ledger.recordShrink("build", { bytesIn: 1000, bytesOut: 100 });
      await ledger.recordShrink("build", { bytesIn: 500, bytesOut: 50 });
      const session = await ledger.load("build");
      assert.equal(session.stats.shrinks, 2);
      assert.equal(session.stats.bytesIn, 1500);
      assert.equal(session.stats.bytesOut, 150);
      assert.match(formatRecall(session), /kept 10%/);
    } finally {
      await cleanup();
    }
  });

  it("rejects path-like session ids and empty notes", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      const ledger = new Ledger(dir);
      await assert.rejects(() => ledger.add("../etc/passwd", "nope"), CtxtrimError);
      await assert.rejects(() => ledger.add("ok", "   "), CtxtrimError);
    } finally {
      await cleanup();
    }
  });

  it("reports a corrupt session file", async () => {
    const { dir, cleanup } = await tempHome();
    try {
      await mkdir(join(dir, "sessions"), { recursive: true });
      await writeFile(join(dir, "sessions", "broken.json"), "{}\n");
      const ledger = new Ledger(dir);
      await assert.rejects(() => ledger.load("broken"), /corrupt/);
    } finally {
      await cleanup();
    }
  });
});
