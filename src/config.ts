import { homedir } from "node:os";
import { join } from "node:path";
import { CtxtrimError } from "./errors.js";

export const DEFAULT_BASE_URL = "https://atmorouter.dev/v1";
export const DEFAULT_MODEL = "zai/glm-5.3";

export type Config = {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  home: string;
  passthroughChars: number;
  glossThreshold: number;
  targetChars: number;
  pressChars: number;
  timeoutMs: number;
  noteBudget: number;
};

function intEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

function normalizeBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CtxtrimError(`CTXTRIM_BASE_URL is not a valid URL: ${value}`, "BAD_CONFIG");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CtxtrimError("CTXTRIM_BASE_URL must be http or https.", "BAD_CONFIG");
  }
  return value.replace(/\/+$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const home = env.CTXTRIM_HOME?.trim();
  return {
    baseUrl: normalizeBaseUrl(env.CTXTRIM_BASE_URL),
    apiKey: env.CTXTRIM_API_KEY?.trim() || undefined,
    model: env.CTXTRIM_MODEL?.trim() || DEFAULT_MODEL,
    home: home || join(homedir(), ".ctxtrim"),
    passthroughChars: intEnv(env.CTXTRIM_PASSTHROUGH_CHARS, 2_000, 0, 1_000_000),
    glossThreshold: intEnv(env.CTXTRIM_GLOSS_THRESHOLD, 3_500, 1, 1_000_000),
    targetChars: intEnv(env.CTXTRIM_TARGET_CHARS, 1_800, 200, 20_000),
    pressChars: intEnv(env.CTXTRIM_PRESS_CHARS, 12_000, 500, 200_000),
    timeoutMs: intEnv(env.CTXTRIM_TIMEOUT_MS, 60_000, 1_000, 300_000),
    noteBudget: intEnv(env.CTXTRIM_NOTE_BUDGET, 4_000, 200, 100_000),
  };
}
