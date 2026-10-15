import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { baseEnv, makeTestOutput, tempHome } from "./helpers.js";

function textOf(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("\n");
}

function failed(result: unknown): boolean {
  return !!result && typeof result === "object" && "isError" in result && (result as { isError?: boolean }).isError === true;
}

describe("mcp server", () => {
  it("shrinks, notes, and recalls over the MCP tool API", async () => {
    const { dir, cleanup } = await tempHome();
    const server = createServer({ env: baseEnv(dir) });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ctxtrim-test", version: "0.0.0" });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const listed = await client.listTools();
      assert.deepEqual(
        listed.tools.map((tool) => tool.name).sort(),
        ["note_add", "note_clear", "note_list", "recall", "shrink"],
      );

      const shrunk = await client.callTool({
        name: "shrink",
        arguments: {
          content: makeTestOutput(),
          kind: "test",
          mode: "offline",
          session: "pr-12",
          label: "npm test",
        },
      });
      const shrunkText = textOf(shrunk);
      assert.equal(failed(shrunk), false);
      assert.match(shrunkText, /AssertionError/);
      assert.match(shrunkText, /ctxtrim · test · press/);
      assert.equal(shrunkText.includes("ok40.test.ts"), false);

      const noted = await client.callTool({
        name: "note_add",
        arguments: { session: "pr-12", text: "flake is in token refresh", tags: ["test"] },
      });
      assert.match(textOf(noted), /saved /);

      const recall = await client.callTool({
        name: "recall",
        arguments: { session: "pr-12" },
      });
      const brief = textOf(recall);
      assert.match(brief, /flake is in token refresh/);
      assert.match(brief, /shrinks 1/);

      const bad = await client.callTool({
        name: "note_add",
        arguments: { session: "../secret", text: "nope" },
      });
      assert.equal(failed(bad), true);
      assert.match(textOf(bad), /Session id/);

      const gloss = await client.callTool({
        name: "shrink",
        arguments: { content: "hello ".repeat(40), mode: "gloss" },
      });
      assert.equal(failed(gloss), true);
      assert.match(textOf(gloss), /CTXTRIM_API_KEY/);
    } finally {
      await client.close();
      await server.close();
      await cleanup();
    }
  });
});
