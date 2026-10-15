const ANSI = /\u001B\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

export function clipLine(line: string, max = 500): string {
  if (line.length <= max) return line;
  return `${line.slice(0, max)}… (${line.length - max} chars clipped)`;
}

export function collapseRuns(lines: string[]): string[] {
  const out: string[] = [];
  let previous = "";
  let count = 0;
  const flush = (): void => {
    if (count === 0) return;
    out.push(count === 1 ? previous : `${previous}  ×${count}`);
  };
  for (const line of lines) {
    if (count > 0 && line === previous) {
      count += 1;
    } else {
      flush();
      previous = line;
      count = 1;
    }
  }
  flush();
  return out;
}

export function stitch(lines: string[], keep: Set<number>): string {
  const out: string[] = [];
  let omitted = 0;
  const flush = (): void => {
    if (omitted === 0) return;
    out.push(`… ${omitted} line${omitted === 1 ? "" : "s"} omitted …`);
    omitted = 0;
  };
  for (let i = 0; i < lines.length; i += 1) {
    if (keep.has(i)) {
      flush();
      out.push(lines[i] ?? "");
    } else {
      omitted += 1;
    }
  }
  flush();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function capText(text: string, maxChars: number): string {
  const trimmed = text.trimEnd();
  if (trimmed.length <= maxChars) return trimmed;
  const markerBudget = 48;
  const tailChars = Math.min(160, Math.floor(maxChars * 0.25));
  const headChars = Math.max(1, maxChars - tailChars - markerBudget);
  const head = trimmed.slice(0, headChars).trimEnd();
  const tail = trimmed.slice(trimmed.length - tailChars).trimStart();
  const omitted = Math.max(0, trimmed.length - headChars - tailChars);
  const combined = `${head}\n… ${omitted} characters omitted …\n${tail}`;
  return combined.length <= maxChars ? combined : combined.slice(0, maxChars);
}

export function looksBinary(text: string): boolean {
  if (text.includes("\0")) return true;
  const sample = text.slice(0, 4_000);
  if (sample.length === 0) return false;
  let weird = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code < 9 || (code > 13 && code < 32)) weird += 1;
  }
  return weird / sample.length > 0.1;
}
