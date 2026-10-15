import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function tempHome(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "ctxtrim-"));
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export function makeLog(): string {
  const lines = ["ready", "ready", "ready"];
  for (let i = 0; i < 300; i += 1) {
    lines.push(`2026-10-15T16:00:${String(i % 60).padStart(2, "0")}Z INFO worker tick ${i}`);
  }
  lines[43] = "2026-10-15T16:00:40Z \u001b[31mERROR\u001b[0m db connection reset peer=10.0.0.8";
  lines[44] = "2026-10-15T16:00:41Z ERROR db connection reset peer=10.0.0.8";
  lines[45] = "2026-10-15T16:00:42Z ERROR db connection reset peer=10.0.0.8";
  lines[183] = "2026-10-15T16:03:00Z WARN queue depth 1400";
  return lines.join("\n");
}

export function makeTestOutput(): string {
  const lines = [" RUN  v3.2.0 /workspace", ""];
  for (let i = 0; i < 80; i += 1) {
    lines.push(` ✓ src/ok${i}.test.ts (2 tests) 3ms`);
  }
  lines.push(
    " ❯ src/auth.test.ts (2 tests | 1 failed) 21ms",
    "   × refresh token > retries once 12ms",
    "     → expected 401 to be 200",
    "",
    " FAIL  src/auth.test.ts > refresh token > retries once",
    "AssertionError: expected 401 to be 200",
    " ❯ src/auth.test.ts:42:17",
    "",
    " Test Files  1 failed | 80 passed (81)",
    "      Tests  1 failed | 160 passed (161)",
    "   Duration  2.40s",
  );
  return lines.join("\n");
}

export function makeSource(): string {
  const lines = [`import { readFile } from "node:fs/promises";`, ""];
  for (let i = 0; i < 40; i += 1) {
    lines.push(`export function handler${i}(input: string): string {`);
    lines.push(`  // body-${i}-unique`);
    lines.push(`  const noise = "${"x".repeat(20)}-${i}";`);
    lines.push("  return noise + input;");
    lines.push("}");
    lines.push("");
  }
  return lines.join("\n");
}

export function makeGeneric(): string {
  const lines: string[] = [];
  for (let i = 0; i < 100; i += 1) {
    lines.push(`paragraph ${i} ${"word ".repeat(6)}end`);
  }
  return lines.join("\n");
}

export function baseEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    CTXTRIM_HOME: home,
    CTXTRIM_API_KEY: "",
    CTXTRIM_BASE_URL: "https://atmorouter.dev/v1",
    CTXTRIM_MODEL: "zai/glm-5.3",
    ...extra,
  };
}
