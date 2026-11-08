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
table in `docs/architecture.md`. In code, `new HookServerBuilder().withConfig(config).withAdapters(adapters).use(...layers).build()`: both inputs are required, so a
half-configured server cannot be built. Layers are added outermost first, and the built-in policy always runs innermost, so they see and
can change its reply.

## Connect a harness

`scripts/install.ts` prints the configuration, and writes it only with `--apply`:

| Command | What |
| --- | --- |
| `bun scripts/install.ts claude` | prints the `hooks` block for Claude Code's `settings.json` (never written: those settings live in dotfiles) |
| `bun scripts/install.ts codex [--apply] [--codex-home <dir>]` | Codex `hooks.json`, command hooks running the shim |
| `bun scripts/install.ts opencode [--apply] [--config-dir <dir>]` | bundles the plugin into one file, `plugins/harness-hooks.js` (removes an older `harness-hooks.ts`) |
| `bun scripts/install.ts service [--apply] [--unit-dir <dir>] [--no-systemctl]` | the systemd user unit that runs this server |

`claude`, `codex` and `service` take `--url <base>` (default `http://127.0.0.1:8787`) and write it into the config; `opencode` ignores it,
because the plugin reads `HOOK_URL` from OpenCode's environment. Nothing changes without `--apply`, and an existing file with different content is
never replaced (merge it by hand); the plugin bundle is the installer's own file and is updated.

## Layout

| Path | What |
| --- | --- |
| `src/server.ts` | `HookServerBuilder` and the entry point |
| `src/http/` | `hook-handler.ts` (routes), `admission.ts` (token, loopback `Host`, JSON content type) |
| `src/config.ts`, `src/net.ts` | environment validation; loopback decision with `ipaddr.js`, no DNS |
| `src/log.ts`, `src/shutdown.ts` | the JSONL log (allowlist, [ADR 0004](../../docs/decisions/0004-the-log-is-an-allowlist.md); rotation) and the drain on SIGTERM/SIGINT |
| `src/middleware-loader.ts` | imports `HOOK_MIDDLEWARE` modules; a module that fails to import stops the start |
| `scripts/snapshot-responses.ts` | records `.expected.json` and `.log.json` for every fixture from the current server; run on trusted code only |

## Tests

End to end only: `test/e2e/harness.ts` spawns `bun src/server.ts` and every test talks to it over HTTP. `contract.test.ts` loops over
every harness and fixture (answer and log line as recorded, timestamp and session id aside, no typed text logged), and on the first fixture of each event (missing, retyped and out-of-set keys reported, never a block);
`events/<harness>/` holds cases unique to one event. The deliberate deviations (the two OpenCode plugin suites with a fake context, and
one in-process decode) are listed with their reasons under Tests in `docs/architecture.md`.
