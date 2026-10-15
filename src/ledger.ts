import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { CtxtrimError } from "./errors.js";
import { isNotFound, readJson, writeJson } from "./jsonstore.js";
import { press } from "./press.js";

export type Note = {
  id: string;
  at: string;
  text: string;
  tags: string[];
};

export type SessionStats = {
  shrinks: number;
  bytesIn: number;
  bytesOut: number;
};

export type SessionFile = {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  digest: string;
  notes: Note[];
  stats: SessionStats;
};

export function assertSessionId(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) {
    throw new CtxtrimError(
      "Session id must be 1–80 characters and use letters, digits, dots, underscores, or hyphens.",
      "BAD_SESSION",
    );
  }
  return id;
}

function sessionPath(root: string, id: string): string {
  const sessions = resolve(root, "sessions");
  const file = resolve(sessions, `${id}.json`);
  if (file !== sessions && !file.startsWith(sessions + sep)) {
    throw new CtxtrimError("Session path escaped the ledger directory.", "BAD_SESSION");
  }
  return file;
}

function emptySession(id: string, now: string): SessionFile {
  return {
    version: 1,
    id,
    createdAt: now,
    updatedAt: now,
    digest: "",
    notes: [],
    stats: { shrinks: 0, bytesIn: 0, bytesOut: 0 },
  };
}

function parseSession(id: string, value: unknown): SessionFile {
  if (!value || typeof value !== "object") {
    throw new CtxtrimError(`Session "${id}" is corrupt.`, "CORRUPT");
  }
  const record = value as Partial<SessionFile>;
  if (record.version !== 1 || record.id !== id || !Array.isArray(record.notes) || typeof record.digest !== "string") {
    throw new CtxtrimError(`Session "${id}" is corrupt.`, "CORRUPT");
  }
  const stats = record.stats;
  if (
    !stats ||
    typeof stats.shrinks !== "number" ||
    typeof stats.bytesIn !== "number" ||
    typeof stats.bytesOut !== "number"
  ) {
    throw new CtxtrimError(`Session "${id}" is corrupt.`, "CORRUPT");
  }
  const notes: Note[] = record.notes.map((note) => {
    if (!note || typeof note !== "object") {
      throw new CtxtrimError(`Session "${id}" is corrupt.`, "CORRUPT");
    }
    const item = note as Partial<Note>;
    if (typeof item.id !== "string" || typeof item.at !== "string" || typeof item.text !== "string" || !Array.isArray(item.tags)) {
      throw new CtxtrimError(`Session "${id}" is corrupt.`, "CORRUPT");
    }
    return { id: item.id, at: item.at, text: item.text, tags: item.tags.filter((tag) => typeof tag === "string") };
  });
  return {
    version: 1,
    id,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : record.updatedAt ?? new Date(0).toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
    digest: record.digest,
    notes,
    stats: { shrinks: stats.shrinks, bytesIn: stats.bytesIn, bytesOut: stats.bytesOut },
  };
}

function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!clean) continue;
    if (!/^[a-z0-9][a-z0-9._-]{0,23}$/.test(clean)) {
      throw new CtxtrimError(`Tag "${tag}" must be 1–24 letters, digits, dots, underscores, or hyphens.`, "BAD_TAG");
    }
    if (!out.includes(clean)) out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

function compactNote(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new CtxtrimError("Note text is empty.", "EMPTY_NOTE");
  if (trimmed.length <= 600) return trimmed;
  const pressed = press(text.trim(), "generic", { maxChars: 500 });
  return pressed.length <= 600 ? pressed : `${pressed.slice(0, 580)}…`;
}

export function formatStamp(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export function formatNotes(session: SessionFile): string {
  if (session.notes.length === 0) return "(none)";
  return session.notes
    .map((note) => {
      const tags = note.tags.length > 0 ? ` [${note.tags.join(", ")}]` : "";
      return `- ${formatStamp(note.at)} ${note.text}${tags}`;
    })
    .join("\n");
}

export function formatRecall(session: SessionFile): string {
  const kept =
    session.stats.bytesIn === 0 ? "n/a" : `${Math.round((session.stats.bytesOut / session.stats.bytesIn) * 100)}%`;
  const lines = [
    `# ${session.id}`,
    `shrinks ${session.stats.shrinks} · in ${session.stats.bytesIn} · out ${session.stats.bytesOut} · kept ${kept}`,
  ];
  if (session.digest) {
    lines.push("", "## earlier", session.digest);
  }
  lines.push("", "## notes", formatNotes(session));
  return lines.join("\n");
}

export class Ledger {
  constructor(
    private readonly root: string,
    private readonly noteBudget = 4_000,
  ) {}

  private file(id: string): string {
    return sessionPath(this.root, assertSessionId(id));
  }

  async load(sessionId: string): Promise<SessionFile> {
    const id = assertSessionId(sessionId);
    const value = await readJson(this.file(id));
    if (value === undefined) return emptySession(id, new Date().toISOString());
    return parseSession(id, value);
  }

  async add(sessionId: string, text: string, tags: string[] = []): Promise<Note> {
    const session = await this.load(sessionId);
    const note: Note = {
      id: randomBytes(4).toString("hex"),
      at: new Date().toISOString(),
      text: compactNote(text),
      tags: normalizeTags(tags),
    };
    session.notes.push(note);
    session.updatedAt = note.at;
    this.roll(session);
    await writeJson(this.file(session.id), session);
    return note;
  }

  async clear(sessionId: string): Promise<void> {
    try {
      await rm(this.file(sessionId));
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  async recordShrink(sessionId: string, bytes: { bytesIn: number; bytesOut: number }): Promise<void> {
    const session = await this.load(sessionId);
    session.stats.shrinks += 1;
    session.stats.bytesIn += bytes.bytesIn;
    session.stats.bytesOut += bytes.bytesOut;
    session.updatedAt = new Date().toISOString();
    await writeJson(this.file(session.id), session);
  }

  private roll(session: SessionFile): void {
    const size = (): number => session.notes.reduce((sum, note) => sum + note.text.length, 0);
    while (session.notes.length > 1 && size() > this.noteBudget) {
      const oldest = session.notes.shift();
      if (!oldest) break;
      const line = `- ${oldest.text}`;
      session.digest = session.digest ? `${session.digest}\n${line}` : line;
    }
    if (session.digest.length > this.noteBudget) {
      session.digest = press(session.digest, "generic", { maxChars: this.noteBudget });
    }
  }
}
