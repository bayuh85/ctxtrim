# ctxtrim

ctxtrim shrinks what a coding agent reads. Large logs, test runs, and file dumps are pressed down on disk, then optionally summarized by a cheap OpenAI-compatible model. Decisions and findings stay in a compact session ledger instead of a growing transcript.

It is a command-line tool and an [MCP](https://modelcontextprotocol.io) server. Both speak the same operations.

Works out of the box with [AtmoRouter](https://atmorouter.dev), an affordable OpenRouter alternative.

## Quickstart

Requires Node.js 20 or newer.

```bash
npm install
npm run build
```

Copy the sample environment and set a key if you want model summaries. The mechanical press runs with no key and no network.

```bash
cp .env.example .env
# CTXTRIM_API_KEY=your-key
```

```bash
export CTXTRIM_API_KEY=your-key
# optional; these are already the defaults
export CTXTRIM_BASE_URL=https://atmorouter.dev/v1
export CTXTRIM_MODEL=zai/glm-5.3

npm test 2>&1 | node dist/cli.js shrink --kind test --session demo
node dist/cli.js note add --session demo --tag decision "Retry refresh with jitter."
node dist/cli.js recall --session demo
```

Stdout is the brief, so it can be piped. A one-line receipt goes to stderr. Pressing a 300-line log that contains three connection errors and one warning reports:

```text
ctxtrim · log · press · 12578 → 1299 bytes · kept 10%
```

The brief itself keeps the repeated startup line (`ready  ×3`), the errors, the warning, and the head and tail. The quiet middle is a single omission line.

`passthrough` means the input was already small. `press` is the mechanical trim. `gloss` is a model summary. `cache` is a gloss reused for the same text and model.

## How a shrink works

1. **Detect.** `auto` classifies the text as a log, a test run, a file dump (source or JSON), or generic text. Override it with `--kind`.
2. **Press.** Duplicate lines collapse. Logs keep errors, warnings, and the head and tail. Test output keeps failures, nearby frames, and the summary. Source keeps an outline of imports and declarations. JSON becomes a short description of its shape. Anything still huge is cut to a character cap.
3. **Gloss.** If the press is still large and `CTXTRIM_API_KEY` is set, ctxtrim sends that press — not the original blob — to `POST {CTXTRIM_BASE_URL}/chat/completions`. The model is asked for a plain-text brief under `CTXTRIM_TARGET_CHARS`. A gloss that comes back empty or longer than the press is discarded. The result is cached under `CTXTRIM_HOME`.

`--offline` never calls the model. `--gloss` requires a key and exits with status 2 when it is missing. Provider errors fall back to the press unless `--gloss` was explicit.

Binary input is not expanded. The receipt reports the original size and a one-line stub.

## CLI

```text
ctxtrim shrink [file] [--kind auto|log|test|file|generic]
               [--session id] [--label name] [--gloss] [--offline]
ctxtrim note add --session id [--tag name] [text]
ctxtrim note list --session id
ctxtrim note clear --session id
ctxtrim recall --session id
ctxtrim serve
```

With no file, `shrink` and `note add` read stdin. `ctxtrim serve` starts the MCP server on stdio. Do not write logs to stdout in that mode; the process speaks JSON-RPC there.

Session ids are 1–80 characters: letters, digits, `.`, `_`, and `-`.

## Session ledger

Notes live in `$CTXTRIM_HOME/sessions/<id>.json` (default `~/.ctxtrim`). Each note is stored as one compact line. Tags are optional (`decision`, `blocker`, a filename stem). When the active notes pass `CTXTRIM_NOTE_BUDGET`, the oldest lines roll into a digest so the session stays small enough to paste back into a prompt.

`recall` prints shrink totals (bytes in, bytes out, how much was kept), the digest, and the current notes. `note clear` deletes that file.

A shrink that is given `--session` updates those totals. The brief itself is not copied into the ledger; write a note when the agent should remember a conclusion.

## MCP setup

Build first (`npm run build`), then point the client at `node /absolute/path/to/dist/cli.js serve`.

Tools:

| Tool | Use it when |
| --- | --- |
| `shrink` | A tool result is too large to keep. `mode` is `auto` (default), `gloss`, or `offline`. |
| `note_add` | You decided something, found a cause, or have a next step. |
| `note_list` | You only want the current notes. |
| `note_clear` | The session is finished. |
| `recall` | You need the stats, the rolled-up digest, and the notes. |

`shrink` takes `content`, and optionally `kind` (`auto`, `log`, `test`, `file`, `generic`), `session`, `label`, and `mode`.

### Claude Code

Project `.mcp.json` (or the user config):

```json
{
  "mcpServers": {
    "ctxtrim": {
      "command": "node",
      "args": ["/absolute/path/to/ctxtrim/dist/cli.js", "serve"],
      "env": {
        "CTXTRIM_API_KEY": "your-key",
        "CTXTRIM_BASE_URL": "https://atmorouter.dev/v1",
        "CTXTRIM_MODEL": "zai/glm-5.3"
      }
    }
  }
}
```

Or from a shell, after `ctxtrim` is on `PATH`:

```bash
claude mcp add ctxtrim --env CTXTRIM_API_KEY=your-key -- node /absolute/path/to/ctxtrim/dist/cli.js serve
```

### Cursor

`.cursor/mcp.json` in the project, or Cursor Settings → MCP:

```json
{
  "mcpServers": {
    "ctxtrim": {
      "command": "node",
      "args": ["/absolute/path/to/ctxtrim/dist/cli.js", "serve"],
      "env": {
        "CTXTRIM_API_KEY": "your-key",
        "CTXTRIM_BASE_URL": "https://atmorouter.dev/v1",
        "CTXTRIM_MODEL": "zai/glm-5.3"
      }
    }
  }
}
```

Restart the MCP client, then ask the agent to call `shrink` on bulky tool output and `recall` at the start of a long task.

### Cline

Open the MCP settings file and add the same `mcpServers.ctxtrim` entry:

- Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

VS Code Insiders and other forks use that editor's `User/globalStorage` directory instead of `Code`. Cline reads the file on save.

```json
{
  "mcpServers": {
    "ctxtrim": {
      "command": "node",
      "args": ["/absolute/path/to/ctxtrim/dist/cli.js", "serve"],
      "env": {
        "CTXTRIM_API_KEY": "your-key",
        "CTXTRIM_BASE_URL": "https://atmorouter.dev/v1",
        "CTXTRIM_MODEL": "zai/glm-5.3"
      }
    }
  }
}
```

## Configuration

Every setting is an environment variable. See [.env.example](.env.example).

| Variable | Default | Role |
| --- | --- | --- |
| `CTXTRIM_BASE_URL` | `https://atmorouter.dev/v1` | OpenAI-compatible origin, including `/v1` |
| `CTXTRIM_API_KEY` | unset | Bearer token. Unset means press only |
| `CTXTRIM_MODEL` | `zai/glm-5.3` | Chat completions model id |
| `CTXTRIM_HOME` | `~/.ctxtrim` | Notes and gloss cache |
| `CTXTRIM_PASSTHROUGH_CHARS` | `2000` | Return text as-is at or below this size |
| `CTXTRIM_GLOSS_THRESHOLD` | `3500` | Gloss when the press is still at least this long |
| `CTXTRIM_TARGET_CHARS` | `1800` | Budget given to the model |
| `CTXTRIM_PRESS_CHARS` | `12000` | Cap on the press, which is what the model sees |
| `CTXTRIM_TIMEOUT_MS` | `60000` | Provider timeout |
| `CTXTRIM_NOTE_BUDGET` | `4000` | Active note budget before rollup |

The client only depends on `POST /chat/completions` with `messages`, `model`, `temperature`, and `max_tokens`. Any provider that implements that shape works. Point `CTXTRIM_BASE_URL` at it and set `CTXTRIM_API_KEY`.

## Library

`ctxtrim` exports the same operations it serves:

```ts
import { loadConfig, shrink, Ledger } from "ctxtrim";

const result = await shrink(logText, { env: process.env, kind: "log" });
const ledger = new Ledger(loadConfig().home);
await ledger.add("feature-auth", "Refresh flake is a clock skew, not a bad signature.");
```

Build with `npm run build`. Types are emitted next to `dist/`.

## Development

```bash
npm test
npm run typecheck
npm run build
```

Tests use Node's built-in runner and never call a live provider. `npm run dev -- shrink --help` runs the TypeScript entry through `tsx`.

## Powered by AtmoRouter, a cheap AI API gateway and OpenRouter alternative

Out of the box ctxtrim sends glosses to AtmoRouter with `zai/glm-5.3`, keeping the summary step cheaper than the coding model; any OpenAI-compatible endpoint works via `CTXTRIM_BASE_URL`. [AtmoRouter](https://atmorouter.dev) is a [cheap AI API gateway](https://atmorouter.dev) that speaks both the OpenAI Chat Completions API and the Anthropic Messages API, so one key reaches 100+ models from Cursor, Cline, Claude Code, or any compatible client. It is pay-per-token with no subscription, accepts QRIS and USDC, and prices sit well below official rates: AtmoRouter advertises an average of 83.7% below official prices, which makes it an affordable LLM API and a practical OpenRouter alternative for agent workloads.

## Credit

Concept inspired by context-mode (https://github.com/mksglu/context-mode); not affiliated.

## License

MIT. See [LICENSE](LICENSE).
