import { readFile } from "node:fs/promises";
import { addNote, clearSession, listNotesText, recallSession, shrinkText } from "./actions.js";
import { CtxtrimError } from "./errors.js";
import { formatReceipt } from "./format.js";
import { HELP } from "./help.js";
import { isNotFound } from "./jsonstore.js";
import { serveStdio } from "./server.js";
import type { ContentKind } from "./types.js";
import { VERSION } from "./version.js";

export type Io = {
  stdin?: string;
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
};

type Parsed = {
  help: boolean;
  version: boolean;
  command?: string;
  action?: string;
  kind?: string;
  session?: string;
  label?: string;
  gloss: boolean;
  offline: boolean;
  tags: string[];
  rest: string[];
};

const KINDS = new Set(["auto", "log", "test", "file", "generic"]);
const VALUE_FLAGS = new Set(["kind", "session", "label", "tag"]);

export function parseArgv(argv: string[]): Parsed {
  const parsed: Parsed = { help: false, version: false, gloss: false, offline: false, tags: [], rest: [] };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token === "-h" || token === "--help") {
      parsed.help = true;
      continue;
    }
    if (token === "-v" || token === "--version") {
      parsed.version = true;
      continue;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      const name = eq === -1 ? body : body.slice(0, eq);
      const inline = eq === -1 ? undefined : body.slice(eq + 1);
      if (name === "gloss" || name === "offline") {
        if (inline !== undefined) throw new CtxtrimError(`--${name} does not take a value.`, "USAGE");
        if (name === "gloss") parsed.gloss = true;
        if (name === "offline") parsed.offline = true;
        continue;
      }
      if (!VALUE_FLAGS.has(name)) throw new CtxtrimError(`Unknown flag --${name}.`, "USAGE");
      const value = inline ?? argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new CtxtrimError(`--${name} needs a value.`, "USAGE");
      }
      if (inline === undefined) i += 1;
      if (name === "tag") parsed.tags.push(value);
      else if (name === "kind") parsed.kind = value;
      else if (name === "session") parsed.session = value;
      else if (name === "label") parsed.label = value;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      throw new CtxtrimError(`Unknown flag ${token}.`, "USAGE");
    }
    positionals.push(token);
  }

  parsed.command = positionals[0];
  if (parsed.command === "note") {
    parsed.action = positionals[1];
    parsed.rest = positionals.slice(2);
  } else {
    parsed.rest = positionals.slice(1);
  }
  return parsed;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readInput(file: string | undefined, io: Io): Promise<string> {
  if (file) {
    try {
      return await readFile(file, "utf8");
    } catch (err) {
      if (isNotFound(err)) throw new CtxtrimError(`File not found: ${file}`, "NO_INPUT");
      throw err;
    }
  }
  if (io.stdin !== undefined) return io.stdin;
  if (process.stdin.isTTY) throw new CtxtrimError("Pass a file or pipe text on stdin.", "NO_INPUT");
  return readStdin();
}

function requireSession(session: string | undefined): string {
  if (!session) throw new CtxtrimError("--session is required.", "USAGE");
  return session;
}

function writeLine(write: (chunk: string) => void, text: string): void {
  write(text.endsWith("\n") ? text : `${text}\n`);
}

export async function run(argv: string[], io: Io = {}): Promise<number> {
  const stdout = io.stdout ?? ((chunk: string) => process.stdout.write(chunk));
  const stderr = io.stderr ?? ((chunk: string) => process.stderr.write(chunk));
  const env = io.env ?? process.env;

  try {
    const parsed = parseArgv(argv);
    if (parsed.help || (!parsed.command && !parsed.version)) {
      writeLine(stdout, HELP);
      return 0;
    }
    if (parsed.version && !parsed.command) {
      writeLine(stdout, `ctxtrim ${VERSION}`);
      return 0;
    }
    if (parsed.gloss && parsed.offline) {
      throw new CtxtrimError("Choose either --gloss or --offline, not both.", "USAGE");
    }

    switch (parsed.command) {
      case "shrink": {
        if (parsed.rest.length > 1) throw new CtxtrimError("shrink accepts at most one file.", "USAGE");
        if (parsed.kind && !KINDS.has(parsed.kind)) {
          throw new CtxtrimError("--kind must be auto, log, test, file, or generic.", "USAGE");
        }
        const content = await readInput(parsed.rest[0], io);
        const result = await shrinkText(content, {
          env,
          kind: (parsed.kind ?? "auto") as ContentKind | "auto",
          gloss: parsed.gloss,
          offline: parsed.offline,
          ...(io.fetch ? { fetch: io.fetch } : {}),
          ...(parsed.session ? { session: parsed.session } : {}),
          ...(parsed.label ? { label: parsed.label } : {}),
        });
        writeLine(stdout, result.text);
        writeLine(stderr, formatReceipt(result.receipt));
        return 0;
      }
      case "note": {
        const session = requireSession(parsed.session);
        if (parsed.action === "add") {
          const text = parsed.rest.length > 0 ? parsed.rest.join(" ") : await readInput(undefined, io);
          const note = await addNote(session, text, parsed.tags, env);
          writeLine(stdout, `saved ${note.id} · ${session}`);
          return 0;
        }
        if (parsed.action === "list") {
          if (parsed.rest.length > 0) throw new CtxtrimError("note list does not take extra arguments.", "USAGE");
          writeLine(stdout, await listNotesText(session, env));
          return 0;
        }
        if (parsed.action === "clear") {
          if (parsed.rest.length > 0) throw new CtxtrimError("note clear does not take extra arguments.", "USAGE");
          await clearSession(session, env);
          writeLine(stdout, `cleared ${session}`);
          return 0;
        }
        throw new CtxtrimError("Use note add, note list, or note clear.", "USAGE");
      }
      case "recall": {
        if (parsed.rest.length > 0) throw new CtxtrimError("recall does not take extra arguments.", "USAGE");
        writeLine(stdout, await recallSession(requireSession(parsed.session), env));
        return 0;
      }
      case "serve": {
        if (parsed.rest.length > 0) throw new CtxtrimError("serve does not take arguments.", "USAGE");
        await serveStdio({ env, ...(io.fetch ? { fetch: io.fetch } : {}) });
        return 0;
      }
      default:
        throw new CtxtrimError(`Unknown command "${parsed.command ?? ""}". Run ctxtrim --help.`, "USAGE");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeLine(stderr, message);
    if (err instanceof CtxtrimError && err.code === "NO_API_KEY") return 2;
    return 1;
  }
}
