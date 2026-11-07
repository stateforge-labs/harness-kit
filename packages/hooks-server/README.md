# @homelab/harness-hooks-server

The HTTP service. It puts [`@homelab/harness-hooks`](../hooks/README.md) behind `POST /hook/<harness>`: admission (bearer token, or
loopback only), one JSONL log line per request, middleware modules loaded from `HOOK_MIDDLEWARE`, graceful shutdown. It runs on Bun.
Request path, configuration table and unresolved items: [`docs/architecture.md`](../../docs/architecture.md).

## Run

```sh
bun run start                  # from this folder, or `bun run start` at the repo root
PORT=0 HOOK_TOKEN=... bun src/server.ts
```

Every setting is an environment variable, validated at start (a bad value exits 2 and never echoes the token); see the Configuration
table in `docs/architecture.md`. In code, `new HookServerBuilder().withConfig(config).withAdapters(adapters).use(...layers).build()`.

## Connect a harness

`scripts/install.ts` prints the configuration, and writes it only with `--apply`:

| Command | What |
| --- | --- |
| `bun scripts/install.ts claude` | prints the `hooks` block for Claude Code's `settings.json` (never written: those settings live in dotfiles) |
| `bun scripts/install.ts codex [--apply] [--codex-home <dir>]` | Codex `hooks.json`, command hooks running the shim |
| `bun scripts/install.ts opencode [--apply] [--config-dir <dir>]` | copies the plugin into OpenCode's `plugins/` |
| `bun scripts/install.ts service [--apply] [--unit-dir <dir>] [--no-systemctl]` | the systemd user unit that runs this server |

All take `--url <base>` (default `http://127.0.0.1:8787`).

## Layout

| Path | What |
| --- | --- |
| `src/server.ts` | `HookServerBuilder` and the entry point |
| `src/http/` | `hook-handler.ts` (routes), `admission.ts` (token, loopback `Host`, JSON content type) |
| `src/config.ts`, `src/net.ts` | environment validation; loopback decision with `ipaddr.js`, no DNS |
| `src/log.ts`, `src/shutdown.ts` | the JSONL log (privacy allowlist, rotation) and the drain on SIGTERM/SIGINT |
| `src/middleware-loader.ts` | imports `HOOK_MIDDLEWARE` modules; a module that fails to import stops the start |
| `scripts/snapshot-responses.ts` | records `.expected.json` and `.log.json` for every fixture from the current server; run on trusted code only |

## Tests

End to end only: `test/e2e/harness.ts` spawns `bun src/server.ts` and every test talks to it over HTTP. `contract.test.ts` loops over
every harness and fixture (answer and log line byte for byte, missing and retyped keys reported, no typed text logged);
`events/<harness>/` holds cases unique to one event. `opencode-plugin.test.ts` is the one deliberate deviation: it drives the plugin with a
fake context against the real server, because OpenCode cannot start in the suite without a model login.
