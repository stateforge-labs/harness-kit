# harness-kit

Hook events from Claude Code, Codex and OpenCode in one neutral form, with a middleware pipeline, a local hook server and the
installers that connect each harness to it.

| Package | What it ships | Runtime |
| --- | --- | --- |
| [`@stateforge-labs/harness-hooks`](packages/hooks/README.md) | Library: neutral events and replies, per-harness decode and encode, the middleware pipeline, the command shim and the OpenCode plugin | Node 22 or later (`dist/`), or Bun (sources) |
| [`@stateforge-labs/harness-hooks-server`](packages/hooks-server/README.md) | HTTP hook server (`POST /hook/<harness>`) and the installer that connects each harness to it | Bun 1.4.4 |

Install the library from npm with `npm install @stateforge-labs/harness-hooks`. The server package is not published to npm; run it from the repository.

## Install

```sh
npm install @stateforge-labs/harness-hooks
```

## Requirements

- Bun 1.4.4 for development (pinned in [`mise.toml`](mise.toml)) and for `harness-hooks-server`.
- Node 22 or later to run the built `harness-hooks` package from `dist/`.

## Quick start

Clone the repository, then install and run the test suite:

```sh
mise install
bun install
bun run test
```

Use the library in code. This example feeds a captured Claude Code `PreToolUse` payload through the default pipeline:

```ts
import { adapters, defaultPipeline, handle } from "@stateforge-labs/harness-hooks";
import { readFileSync } from "node:fs";

const payload = JSON.parse(readFileSync("packages/hooks/fixtures/claude/PreToolUse/02-bash.json", "utf8"));
const { body } = await handle(adapters.get("claude")!, payload, defaultPipeline());
console.log(JSON.stringify(body));
```

Expected output, because the default pipeline adds no context and no decision to this event:

```text
{}
```

Start the hook server on loopback and send it the same payload:

```sh
bun --filter @stateforge-labs/harness-hooks-server start
curl -s -X POST -H 'content-type: application/json' \
  --data-binary @packages/hooks/fixtures/claude/PreToolUse/02-bash.json \
  http://127.0.0.1:8787/hook/claude
```

Expected output:

```text
{}
```

The server prints `harness-hooks listening on 127.0.0.1:8787` when it starts. The configuration and the installers are in the
[server README](packages/hooks-server/README.md).

## Documentation

- [Architecture](docs/architecture.md): request path, middleware order, log and shutdown behaviour, configuration.
- [Decisions](docs/decisions/): architecture decision records, from the first (library layers) to the log allowlist.
- [Library README](packages/hooks/README.md) and [server README](packages/hooks-server/README.md): exports, installers, environment variables.

## Contributing, security and support

- [CONTRIBUTING.md](CONTRIBUTING.md): development setup, scripts, layout and how changes are reviewed.
- [SECURITY.md](SECURITY.md): how to report a vulnerability. Do not open a public issue for one.
- [SUPPORT.md](SUPPORT.md): where to ask questions and report bugs.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): expected behaviour in project spaces.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.

## License

MIT. See [LICENSE](LICENSE).
