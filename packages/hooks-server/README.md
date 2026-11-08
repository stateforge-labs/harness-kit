# @stateforge-labs/harness-hooks-server

An HTTP service that receives the hook events of Claude Code, Codex and OpenCode and answers each one in that harness's own format.
It puts [`@stateforge-labs/harness-hooks`](https://github.com/stateforge-labs/harness-kit/blob/main/packages/hooks/README.md) behind `POST /hook/<harness>`. On each request it checks admission (a bearer
token, or loopback only), writes one JSON line to the log, and runs the middleware modules you name in `HOOK_MIDDLEWARE`. It shuts down
gracefully on SIGTERM and SIGINT.

## Requirements

- Bun 1.4.4 (pinned in [`mise.toml`](https://github.com/stateforge-labs/harness-kit/blob/main/mise.toml)). The server uses `Bun.serve`
  and runs from source; no Node build exists for it. Other Bun versions are not tested.
- The `service` installer command writes a systemd user unit, so it needs systemd and `systemctl --user`. The other installer commands
  only write files.

## Install

This package is not on npm under this name yet. In the repository, run `bun install` at the root, then start the server from this folder.

## Run

```sh
bun run start                                  # from this folder, or `bun --filter @stateforge-labs/harness-hooks-server start` at the root
PORT=0 HOOK_TOKEN=change-me bun src/server.ts   # PORT=0 asks the system for a free port
```

On start the server prints the listening address, for example:

```text
HOOK_TOKEN is empty: auth disabled (loopback only)
harness-hooks listening on 127.0.0.1:8787
```

The first line is a warning that appears only when `HOOK_TOKEN` is empty.

In code, build a server from a config and the adapters. Both inputs are required, so a half-configured server cannot be built. Layers
are added outermost first. The built-in policy always runs innermost, so every layer sees its reply and can change it.

```ts
import { adapters } from "@stateforge-labs/harness-hooks";
import { ServerConfig } from "./src/config.ts";
import { HookServerBuilder } from "./src/server.ts";

const server = new HookServerBuilder()
  .withConfig(new ServerConfig())
  .withAdapters(adapters)
  .build();
```

## Environment variables

Every setting is an environment variable. They are validated when the server starts. A bad value prints one message that lists every
invalid setting and exits with code 2. The message never contains the token.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | Listening port. `0` asks the system for a free port |
| `HOOK_HOST` | `127.0.0.1` | Listening address. A non-loopback address requires `HOOK_TOKEN` |
| `HOOK_TOKEN` | empty | Bearer token for `POST /hook/<harness>`. Empty means loopback only |
| `HOOK_LOG_FILE` | `./data/events.jsonl` | JSONL log. It rotates to `<file>.1` at `HOOK_LOG_MAX_BYTES` |
| `HOOK_LOG_MAX_BYTES` | 100 MiB | Size at which the log rotates |
| `HOOK_LOG_PAYLOAD` | off | `1` also logs the full payload. For debugging only; it can contain prompts and tool input |
| `HOOK_MAX_BODY_BYTES` | 32 MiB | Larger request bodies get `413` |
| `HOOK_SHUTDOWN_GRACE_MS` | `5000` | Time to wait for requests in flight on shutdown, before they are closed |
| `HOOK_MIDDLEWARE` | empty | Comma-separated absolute paths of middleware modules. Each exports a `Middleware` or an array of them |
| `HOOK_MIDDLEWARE_TIMEOUT_MS` | `2000` | A middleware layer slower than this is skipped |

Clients read their own variables on every call. They are used by the command shim and by the OpenCode plugin, not by the server:

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOOK_URL` | `http://127.0.0.1:8787` | The server to post to |
| `HOOK_TOKEN` | empty | Bearer token sent to the server. Never printed |
| `HOOK_SHIM_TIMEOUT_MS`, `HOOK_PLUGIN_TIMEOUT_MS` | `5000` | Give up on the server after this long |
| `HOOK_SHIM_FAIL`, `HOOK_PLUGIN_FAIL` | `open` | `closed` refuses the pre-tool call (and the shim's PermissionRequest) when the server fails |
| `HOOK_SHIM_DENY_REASON`, `HOOK_PLUGIN_DENY_REASON` | a fixed refusal text | The refusal text in closed mode |
| `HOOK_PLUGIN_MAX_CONTINUES` | `8` | Continues in a row per session |
| `HOOK_SHIM_DEBUG` | off | `1` says on stderr why the shim failed |

The installer reads `XDG_CONFIG_HOME`, `XDG_STATE_HOME` and `CODEX_HOME` for the default locations of its files.

## Exit codes

| Process | Code | Meaning |
| --- | --- | --- |
| Server | 0 | Stopped cleanly on SIGTERM or SIGINT, after the log was flushed |
| Server | 1 | The grace period ran out with requests still open (they were closed), or a second signal arrived while shutting down |
| Server | 2 | Invalid configuration, or a `HOOK_MIDDLEWARE` module failed to load or has the wrong shape |
| Installer (`scripts/install.ts`) | 0 | Printed or applied the configuration |
| Installer | 1 | Usage error, an invalid `--url`, a file with different content that it will not overwrite, `claude --apply`, or a failed `systemctl --user` call |

## Connect a harness

`scripts/install.ts` prints the configuration and writes it only with `--apply`:

| Command | What it does |
| --- | --- |
| `bun scripts/install.ts claude` | Prints the `hooks` block for Claude Code's `settings.json`. It is never written, because those settings live in your dotfiles. Every hook gets a 10 s timeout, and the two worktree hooks get 60 s |
| `bun scripts/install.ts codex [--apply] [--codex-home <dir>]` | Codex `hooks.json`, with command hooks that run the shim |
| `bun scripts/install.ts opencode [--apply] [--config-dir <dir>]` | Bundles the plugin into one file, `plugins/harness-hooks.js`. It removes an older `harness-hooks.ts` |
| `bun scripts/install.ts service [--apply] [--unit-dir <dir>] [--no-systemctl]` | The systemd user unit that runs this server |

`claude`, `codex` and `service` take `--url <base>` (default `http://127.0.0.1:8787`) and write it into the config. `opencode` ignores
`--url`, because the plugin reads `HOOK_URL` from OpenCode's environment.

Nothing changes without `--apply`. An existing file with different content is never replaced; merge it by hand. The plugin bundle is the
installer's own file, so the installer updates it.

## Requests and log lines

A hook request is a JSON body posted to `/hook/<harness>` (`/hook` alone is the Claude Code route). A `PreToolUse` request from Claude
Code looks like this, abbreviated:

```http
POST /hook/claude HTTP/1.1
content-type: application/json

{"session_id":"fx-PreToolUse-2","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"..."},"cwd":"...", ...}
```

The response is the harness's own answer. When no layer decides anything, it is `{}`:

```json
{}
```

Each request writes one line to `HOOK_LOG_FILE`. Only allowlisted fields are written ([ADR 0004](https://github.com/stateforge-labs/harness-kit/blob/main/docs/decisions/0004-the-log-is-an-allowlist.md)):

```json
{"ts":"2026-11-08T23:22:10.148Z","harness":"claude","event":"PreToolUse","session_id":"fx-PreToolUse-2","tool_name":"Bash","keys":["cwd","effort","hook_event_name","permission_mode","prompt_id","session_id","tool_input","tool_name","tool_use_id","transcript_path"],"known":true,"missing":[],"wrong_type":[],"permission_mode":"auto","subagent_type":null,"model":null,"advised":false}
```

The log holds key names and counts, never the text of prompts or tool input (unless `HOOK_LOG_PAYLOAD=1`).

## Endpoints

| Route | Answer |
| --- | --- |
| `POST /hook/<harness>` | The harness's response to the hook. `<harness>` is `claude`, `codex` or `opencode` |
| `POST /hook` | The same as `POST /hook/claude` |
| `GET /healthz` | Health check |
| anything else | `404`, or `405` for the wrong method |

Admission runs before the harness lookup, so an unauthenticated caller cannot learn which harnesses exist.

## Security

- **Admission.** With `HOOK_TOKEN` set, the request must carry `Authorization: Bearer <token>`. Without a token, the server listens on
  loopback only and also requires a loopback `Host` header (this stops DNS rebinding) and a JSON content type (a cross-site form
  cannot send one). A non-loopback `HOOK_HOST` without a token refuses to start.
- **What is logged.** The log is an allowlist of fields. Full payloads are logged only when `HOOK_LOG_PAYLOAD=1` is set, which you
  should not do on a shared machine.
- **Middleware runs your code.** Every path in `HOOK_MIDDLEWARE` is imported and run with the server's permissions, and a middleware
  can read the native payload, change or deny any reply, and make network calls. Name only modules you wrote or have reviewed. A layer
  that throws or times out is skipped, so it cannot stop the agent, but it still runs.
- **Reporting.** See [SECURITY.md](https://github.com/stateforge-labs/harness-kit/blob/main/SECURITY.md).

The architecture page explains the request path and the shutdown behaviour in more detail: [`docs/architecture.md`](https://github.com/stateforge-labs/harness-kit/blob/main/docs/architecture.md).
