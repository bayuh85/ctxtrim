import { DEFAULT_BASE_URL, DEFAULT_MODEL } from "./config.js";

export const HELP = `ctxtrim — shrink tool output before it lands in a coding agent's context

Usage:
  ctxtrim shrink [file] [--kind auto|log|test|file|generic] [--session id]
                 [--label name] [--gloss] [--offline]
  ctxtrim note add --session id [--tag name] [text]
  ctxtrim note list --session id
  ctxtrim note clear --session id
  ctxtrim recall --session id
  ctxtrim serve

Shrink reads a file or stdin and writes a shorter brief to stdout.
A one-line receipt goes to stderr. Large output is pressed mechanically
(duplicate lines, passing tests, file outlines, JSON shape). When an API
key is set and the press is still large, a cheap model writes the gloss.
Without a key, the press is the result.

  --kind       auto (default), log, test, file, or generic
  --session    ledger id (letters, digits, dot, underscore, hyphen)
  --label      short name included in the gloss prompt
  --gloss      require a model summary (fails if CTXTRIM_API_KEY is unset)
  --offline    never call the model
  --tag        note tag, repeatable (note add)
  -h, --help
  -v, --version

Environment:
  CTXTRIM_BASE_URL   default ${DEFAULT_BASE_URL}
  CTXTRIM_API_KEY    bearer token for the provider
  CTXTRIM_MODEL      default ${DEFAULT_MODEL}
  CTXTRIM_HOME       state directory (default ~/.ctxtrim)

Powered by AtmoRouter (https://atmorouter.dev)
Concept inspired by context-mode (https://github.com/mksglu/context-mode); not affiliated.
`;
