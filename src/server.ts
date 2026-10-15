import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { addNote, clearSession, listNotesText, recallSession, shrinkText } from "./actions.js";
import { formatForAgent } from "./format.js";
import type { ShrinkOptions } from "./shrink.js";
import { VERSION } from "./version.js";

export type ServerDeps = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
};

const kindSchema = z
  .enum(["auto", "log", "test", "file", "generic"])
  .optional()
  .describe("How to read the text. auto detects logs, test output, file dumps, or generic text.");

const sessionSchema = z
  .string()
  .optional()
  .describe("Session id for the local ledger. Letters, digits, dots, underscores, hyphens.");

function toolError(err: unknown): { content: [{ type: "text"; text: string }]; isError: true } {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: message }], isError: true };
}

function toolOk(text: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text }] };
}

export function createServer(deps: ServerDeps = {}): McpServer {
  const env = deps.env ?? process.env;
  const server = new McpServer(
    { name: "ctxtrim", version: VERSION },
    {
      instructions:
        "Use shrink on large logs, test output, and file dumps before keeping them in context. Use note_add for decisions and findings. Use recall to reload the compact session brief.",
    },
  );

  server.registerTool(
    "shrink",
    {
      title: "Shrink tool output",
      description:
        "Compress a large tool result (log, test output, or file dump) into a short brief. Call this before keeping a big observation in context.",
      inputSchema: {
        content: z.string().describe("Raw tool output to shrink."),
        kind: kindSchema,
        session: sessionSchema,
        label: z.string().optional().describe("Short label included in the summary prompt, such as a command or path."),
        mode: z
          .enum(["auto", "gloss", "offline"])
          .optional()
          .describe("auto glosses when the press is still large and an API key is set. gloss requires a key. offline never calls the model."),
      },
    },
    async (args) => {
      try {
        const mode = args.mode ?? "auto";
        const options: ShrinkOptions & { session?: string } = {
          env,
          kind: args.kind ?? "auto",
          gloss: mode === "gloss",
          offline: mode === "offline",
        };
        if (deps.fetch) options.fetch = deps.fetch;
        if (args.session) options.session = args.session;
        if (args.label) options.label = args.label;
        const result = await shrinkText(args.content, options);
        return toolOk(formatForAgent(result));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "note_add",
    {
      title: "Add a session note",
      description: "Store a compact session note: a decision, a finding, or a next step.",
      inputSchema: {
        session: z.string().describe("Session id."),
        text: z.string().describe("The note. Long text is pressed down before it is stored."),
        tags: z.array(z.string()).optional().describe("Optional short tags, such as decision or blocker."),
      },
    },
    async (args) => {
      try {
        const note = await addNote(args.session, args.text, args.tags ?? [], env);
        return toolOk(`saved ${note.id} · ${args.session}`);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "note_list",
    {
      title: "List session notes",
      description: "List the compact notes currently stored for a session.",
      inputSchema: {
        session: z.string().describe("Session id."),
      },
    },
    async (args) => {
      try {
        return toolOk(await listNotesText(args.session, env));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "note_clear",
    {
      title: "Clear a session",
      description: "Delete a session's notes, rolled-up digest, and shrink stats.",
      inputSchema: {
        session: z.string().describe("Session id."),
      },
    },
    async (args) => {
      try {
        await clearSession(args.session, env);
        return toolOk(`cleared ${args.session}`);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "recall",
    {
      title: "Recall a session brief",
      description: "Return shrink stats, rolled-up earlier notes, and the current notes for a session.",
      inputSchema: {
        session: z.string().describe("Session id."),
      },
    },
    async (args) => {
      try {
        return toolOk(await recallSession(args.session, env));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  return server;
}

export async function serveStdio(deps: ServerDeps = {}): Promise<void> {
  const server = createServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
