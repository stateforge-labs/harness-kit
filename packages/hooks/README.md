# @homelab/harness-hooks

Turns a hook payload from Claude Code, Codex or OpenCode into a neutral event, runs it through a middleware pipeline, and turns the
neutral reply back into that harness's own response. It has no HTTP server and no Bun API in its shipped code, so it runs under Node
(from `dist/`) and under Bun (from `src/`).

## Requirements

- Node 22 or later for the built package in `dist/`.
- Bun 1.4.4 for the sources (`src/` and `clients/` through the `bun` export condition).
- Depends on [zod](https://zod.dev) 4 (`zod` 4.6.7 is pinned in `package.json`); npm and Bun install it with the package.

## Install

This package is not on npm under these names yet. In the repository, `bun install` links it into the workspace; a consumer outside the
repository depends on it by name once it is published.

## Usage

```ts
import { adapters, defaultPipeline, fixturesDir, handle } from "@homelab/harness-hooks";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// fixturesDir is the package's own fixtures folder; any Claude Code PreToolUse payload works here.
const payload = JSON.parse(readFileSync(join(fixturesDir, "claude/PreToolUse/02-bash.json"), "utf8"));
const { body } = await handle(adapters.get("claude")!, payload, defaultPipeline());
console.log(JSON.stringify(body));
```

Expected output for that payload with the default pipeline, which adds no context and no decision:

```text
{}
```

`handle()` never throws. If decoding, a layer or encoding fails, the answer is `{}` (or the deny of a pipeline built to fail closed), so a
broken adapter does not stop the agent. A layer can add context, replace the reply or answer alone; see
the middleware section of the [architecture page](https://github.com/stateforge-labs/harness-kit/blob/main/docs/architecture.md).

## Exports

| Import | What |
| --- | --- |
| `@homelab/harness-hooks` | `adapters` (registry by harness id), `handle(adapter, raw, pipeline)`, `Pipeline` (per-layer `{ timeoutMs, onFault }`), `defaultPipeline`, `policyLayer`, `worktreeLayer`, `onKinds`, `mergeReplies`, `toolAllowlist`, `denyText`, `continueText`, `policy`, the neutral types (`NeutralEvent`, `NeutralReply`, `HarnessAdapter`, ...), and the on-disk paths `shimPath`, `opencodePluginPath`, `fixturesDir` and `schemasDir` |
| `@homelab/harness-hooks/shim` | The command shim. It reads a hook payload from stdin and posts it to `POST /hook/<harness>`. It fails open to `{}`; with `HOOK_SHIM_FAIL=closed` it refuses PreToolUse and PermissionRequest instead |
| `@homelab/harness-hooks/opencode-plugin` | The OpenCode plugin. It adds the rules to each model request and throws on a deny. It fails open, or closed with `HOOK_PLUGIN_FAIL=closed` |
| `@homelab/harness-hooks/fixtures/*` | Captured and synthetic payloads, each with `.expected.json` and `.log.json` snapshots |
| `@homelab/harness-hooks/schemas/*` | JSON Schema per harness event, generated from the zod schemas (documentation only) |

Anything not listed is internal. The `bun` export condition points at `src/` and `clients/`. Every other runtime gets `dist/`.

## Supported harness events

| Harness | Events |
| --- | --- |
| Claude Code | every event in `schemas/claude/`, from `ConfigChange` to `WorktreeRemove` |
| Codex | `PostModelRequest`, `PreToolUse`, `PostToolUse`, `SessionStart` and the others in `schemas/codex/` |
| OpenCode | the events in `schemas/opencode/` (for example `tool.execute.before` and `session.prompt`) |

Each event's JSON Schema is in `schemas/<harness>/<Event>.json`. The zod schema is the source of truth, and the JSON Schema is generated
from it.

## Documentation

- [Architecture](https://github.com/stateforge-labs/harness-kit/blob/main/docs/architecture.md): how the pieces fit, the request path, the middleware contract and the adapters.
- [Decisions](https://github.com/stateforge-labs/harness-kit/blob/main/docs/decisions/): why the library is split into layers, and why the log is an allowlist.
- [Server](https://github.com/stateforge-labs/harness-kit/blob/main/packages/hooks-server/README.md): the HTTP service that runs this library behind `POST /hook/<harness>`.

## Contributing, security and support

[CONTRIBUTING.md](https://github.com/stateforge-labs/harness-kit/blob/main/CONTRIBUTING.md) explains the scripts, tests and layout.
[SECURITY.md](https://github.com/stateforge-labs/harness-kit/blob/main/SECURITY.md) explains how to report a vulnerability.
Questions and bug reports go to [GitHub issues](https://github.com/stateforge-labs/harness-kit/issues).

## License

This package has no license file yet, so no right to use, copy, modify or distribute it is granted. See the
[repository README](https://github.com/stateforge-labs/harness-kit#license).
