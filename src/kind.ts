import type { ContentKind } from "./types.js";

export function detectKind(text: string): ContentKind {
  const sample = text.slice(0, 12_000);
  let test = 0;
  let log = 0;
  let file = 0;

  if (/\b(?:FAIL|FAILED|PASS|PASSED)\b/.test(sample)) test += 1;
  if (/Test Files|Test Suites|^\s*Tests\s+\d+\s+failed|not ok \d+|--- FAIL:|--- PASS:/m.test(sample)) {
    test += 3;
  }
  if (/[✓✔✗✘]/.test(sample)) test += 2;
  if (/\b(?:pytest|vitest|jest|mocha|rspec)\b/i.test(sample)) test += 2;
  if (/AssertionError|Assertion Failed/.test(sample)) test += 2;

  let logLines = 0;
  for (const line of sample.split("\n")) {
    if (/\b(?:INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\b/.test(line) && /\d{2}:\d{2}:\d{2}/.test(line)) {
      logLines += 1;
    }
  }
  if (logLines >= 3) log += 3;
  if (logLines >= 8) log += 2;

  if (/^(?:import |export |from |package |using |#include )/m.test(sample)) file += 2;
  if (/^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum|def|fn|func)\b/m.test(sample)) {
    file += 2;
  }
  const trimmed = sample.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) file += 3;
  if (/^diff --git |^@@ /m.test(sample)) file += 3;

  if (test >= 3 && test >= log && test >= file) return "test";
  if (log >= 3 && log >= file) return "log";
  if (file >= 3) return "file";
  return "generic";
}
