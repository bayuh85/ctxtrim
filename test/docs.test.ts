import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("project docs", () => {
  it("ships the license, provider defaults, and required credits", async () => {
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
    const license = await readFile(new URL("../LICENSE", import.meta.url), "utf8");
    const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
    const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

    assert.match(readme, /## Quickstart/);
    assert.match(readme, /Claude Code/);
    assert.match(readme, /Cursor/);
    assert.match(readme, /Cline/);
    assert.match(readme, /## Powered by AtmoRouter \(https:\/\/atmorouter\.dev\)/);
    assert.match(
      readme,
      /Concept inspired by context-mode \(https:\/\/github\.com\/mksglu\/context-mode\); not affiliated\./,
    );
    assert.match(readme, /https:\/\/atmorouter\.dev\/v1/);
    assert.match(readme, /zai\/glm-5\.3/);

    assert.match(license, /MIT License/);
    assert.match(example, /CTXTRIM_BASE_URL=https:\/\/atmorouter\.dev\/v1/);
    assert.match(example, /CTXTRIM_MODEL=zai\/glm-5\.3/);
    assert.match(example, /CTXTRIM_API_KEY=/);
    assert.match(workflow, /npm test/);
    assert.match(workflow, /npm run typecheck/);
  });
});
