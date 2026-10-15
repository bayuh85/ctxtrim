import type { ContentKind } from "./types.js";
import { capText, clipLine, collapseRuns, stitch, stripAnsi } from "./textutil.js";

const ERROR_LINE =
  /\b(?:ERROR|FATAL|PANIC|CRITICAL)\b|\b(?:error|fatal|panic):|Traceback \(most recent call last\)|UnhandledPromiseRejection|uncaughtException/i;
const WARN_LINE = /\b(?:WARN|WARNING)\b|\bwarn:/i;

const OUTLINE =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|struct|impl|fn|func|def|module)\b|^(?:import|from|package|using)\b|^#include\b|^diff --git |^@@ |^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\b/;

function isPassingLine(line: string): boolean {
  return (
    /^\s*(?:✓|✔|√)\s/.test(line) ||
    /^\s*PASS\b/.test(line) ||
    /^ok\s+\S/.test(line) ||
    /^\s*--- PASS:/.test(line)
  );
}

function isFailureLine(line: string): boolean {
  return (
    /^\s*(?:✗|✘|×|❯)\s/.test(line) ||
    /\bFAIL(?:ED|URE)?\b/.test(line) ||
    /^not ok\s+\d+/.test(line) ||
    /^\s*--- FAIL:/.test(line) ||
    /AssertionError/.test(line) ||
    /^\s+→\s/.test(line) ||
    /^\s+Error:/.test(line)
  );
}

function isSummaryLine(line: string): boolean {
  return (
    /^\s*(?:Test Files|Test Suites|Tests|Duration|Snapshots|Time|Ran all)\b/.test(line) ||
    /^\s*\d+\s+(?:failed|passed|skipped)\b/.test(line) ||
    /short test summary info/i.test(line) ||
    (/^=+.*=+$/.test(line.trim()) && /(failed|passed|error)/i.test(line))
  );
}

function pressLog(lines: string[]): string {
  const head = 12;
  const tail = 12;
  if (lines.length <= head + tail) return lines.join("\n");
  const keep = new Set<number>();
  for (let i = 0; i < head; i += 1) keep.add(i);
  for (let i = lines.length - tail; i < lines.length; i += 1) keep.add(i);

  let warnings = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (ERROR_LINE.test(line)) {
      if (i > 0) keep.add(i - 1);
      keep.add(i);
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j += 1) {
        const next = lines[j] ?? "";
        if (/^\s+at\s/.test(next) || /^\s+File "/.test(next) || next.trim() === "" || /^\s*\^/.test(next)) {
          keep.add(j);
          continue;
        }
        break;
      }
    } else if (warnings < 15 && WARN_LINE.test(line)) {
      warnings += 1;
      keep.add(i);
    }
  }
  return stitch(lines, keep);
}

function pressTest(lines: string[]): string {
  if (lines.length <= 30) return lines.join("\n");
  const keep = new Set<number>();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^\s*RUN\b/.test(line) || isSummaryLine(line) || isFailureLine(line)) keep.add(i);
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (!isFailureLine(lines[i] ?? "")) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 11); j += 1) {
      const next = lines[j] ?? "";
      if (isPassingLine(next)) continue;
      keep.add(j);
      if (next.trim() === "") break;
    }
  }
  if (keep.size === 0) return pressGeneric(lines);
  return stitch(lines, keep);
}

function pressSource(lines: string[]): string {
  if (lines.length <= 80) return lines.join("\n");
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(8, lines.length); i += 1) keep.add(i);
  for (let i = Math.max(0, lines.length - 6); i < lines.length; i += 1) keep.add(i);
  let outlined = 0;
  for (let i = 0; i < lines.length && outlined < 60; i += 1) {
    if (OUTLINE.test(lines[i] ?? "")) {
      keep.add(i);
      outlined += 1;
    }
  }
  return stitch(lines, keep);
}

function pressGeneric(lines: string[]): string {
  if (lines.length <= 40) return lines.join("\n");
  const keep = new Set<number>();
  for (let i = 0; i < 20; i += 1) keep.add(i);
  for (let i = lines.length - 12; i < lines.length; i += 1) keep.add(i);
  return stitch(lines, keep);
}

function describeJson(value: unknown, depth: number): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array(0)";
    if (depth >= 2) return `array(${value.length})`;
    return `array(${value.length}) · first ${describeJson(value[0], depth + 1)}`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const listed = keys.slice(0, 12);
    const extra = keys.length > listed.length ? `, …+${keys.length - listed.length}` : "";
    const header = `object { ${listed.join(", ")}${extra} }`;
    if (depth >= 2) return header;
    const lines = [header];
    for (const key of listed) {
      lines.push(`  ${key}: ${describeJson(record[key], depth + 1)}`);
    }
    return lines.join("\n");
  }
  if (typeof value === "string") {
    return value.length > 60 ? `string(${value.length})` : JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value;
}

function jsonDigest(text: string): string | null {
  const start = text.trimStart();
  if (!start.startsWith("{") && !start.startsWith("[")) return null;
  try {
    const value = JSON.parse(text) as unknown;
    const digest = `json\n${describeJson(value, 0)}`;
    if (digest.length >= text.length) return null;
    return digest;
  } catch {
    return null;
  }
}

export function press(text: string, kind: ContentKind, options?: { maxChars?: number }): string {
  const maxChars = options?.maxChars ?? 12_000;
  const normalized = stripAnsi(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "";

  if (kind === "file") {
    const digest = jsonDigest(normalized);
    if (digest) return capText(digest, maxChars);
  }

  const lines = collapseRuns(normalized.split("\n").map((line) => clipLine(line)));
  let body: string;
  switch (kind) {
    case "log":
      body = pressLog(lines);
      break;
    case "test":
      body = pressTest(lines);
      break;
    case "file":
      body = pressSource(lines);
      break;
    default:
      body = pressGeneric(lines);
  }
  return capText(body, maxChars);
}
