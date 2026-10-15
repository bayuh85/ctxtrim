import { loadConfig, type Config } from "./config.js";
import { assertSessionId, formatNotes, formatRecall, Ledger, type Note, type SessionFile } from "./ledger.js";
import { shrink, type ShrinkOptions } from "./shrink.js";
import type { ShrinkResult } from "./types.js";

function openLedger(env?: NodeJS.ProcessEnv, config?: Config): Ledger {
  const resolved = config ?? loadConfig(env);
  return new Ledger(resolved.home, resolved.noteBudget);
}

export async function shrinkText(
  content: string,
  options: ShrinkOptions & { session?: string },
): Promise<ShrinkResult> {
  if (options.session) assertSessionId(options.session);
  const result = await shrink(content, options);
  if (options.session) {
    const ledger = openLedger(options.env, options.config);
    await ledger.recordShrink(options.session, result.receipt);
  }
  return result;
}

export async function addNote(
  session: string,
  text: string,
  tags: string[] = [],
  env?: NodeJS.ProcessEnv,
): Promise<Note> {
  return openLedger(env).add(session, text, tags);
}

export async function listSession(session: string, env?: NodeJS.ProcessEnv): Promise<SessionFile> {
  return openLedger(env).load(session);
}

export async function clearSession(session: string, env?: NodeJS.ProcessEnv): Promise<void> {
  await openLedger(env).clear(session);
}

export async function recallSession(session: string, env?: NodeJS.ProcessEnv): Promise<string> {
  return formatRecall(await listSession(session, env));
}

export async function listNotesText(session: string, env?: NodeJS.ProcessEnv): Promise<string> {
  return formatNotes(await listSession(session, env));
}
