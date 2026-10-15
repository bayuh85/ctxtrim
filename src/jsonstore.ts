import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function isNotFound(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ENOENT";
}

export async function readJson(file: string): Promise<unknown | undefined> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as unknown;
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
}
