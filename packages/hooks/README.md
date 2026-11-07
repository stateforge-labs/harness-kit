# @homelab/harness-hooks

The library. It turns a hook payload from Claude Code, Codex or OpenCode into a neutral event, runs it through a middleware pipeline,
and turns the neutral reply back into that harness's own response. It has no HTTP server and no Bun API in shipped code, so it runs
under Bun (sources) and Node (`dist/`). The service that puts it behind HTTP is [`@homelab/harness-hooks-server`](../hooks-server/README.md).
How the pieces fit: [`docs/architecture.md`](../../docs/architecture.md). Why it is a library: [ADR 0001](../../docs/decisions/0001-library-layers-service-boundary.md), [ADR 0002](../../docs/decisions/0002-one-repo-for-hooks-and-non-interactive-adapters.md).

## What it exports

| Import | What |
| --- | --- |
| `@homelab/harness-hooks` | `adapters` (registry by harness id), `handle(adapter, raw, pipeline)`, `Pipeline`, `defaultPipeline`, `policyLayer`, `onKinds`, `mergeReplies`, `policy`, the neutral types (`NeutralEvent`, `NeutralReply`, `HarnessAdapter`, ...), and on-disk paths (`shimPath`, `opencodePluginPath`, `fixturesDir`, `schemasDir`) |
| `@homelab/harness-hooks/shim` | the command shim (stdin to `POST /hook/<harness>`, fails open to `{}`) |
| `@homelab/harness-hooks/opencode-plugin` | the OpenCode plugin (reports only, fails open) |
| `@homelab/harness-hooks/fixtures/*` | captured and synthetic payloads with `.expected.json` and `.log.json` snapshots |
| `@homelab/harness-hooks/schemas/*` | generated JSON Schema per harness event |

Anything not listed is internal. Exports are conditional: the `bun` condition points at `src/` and `clients/`, every other runtime at `dist/`.

```ts
import { adapters, defaultPipeline, handle } from "@homelab/harness-hooks";

const { body } = await handle(adapters.get("claude")!, payload, defaultPipeline());
```

## Layout

| Path | What |
| --- | --- |
| `src/core/` | neutral event, reply, policy and the pipeline; knows no harness |
| `src/port.ts` | the `HarnessAdapter` interface every harness implements |
| `src/adapters/<harness>/` | zod schemas (`events/`), log metadata (`handlers/`), closed value sets (`enums.ts`), kind table (`neutral.ts`), encode rules |
| `clients/` | the shim and the OpenCode plugin; each imports nothing, so it can be copied and run alone |
| `fixtures/<harness>/<Event>/` | payloads and snapshots, with a `provenance.json` per harness |
| `schemas/<harness>/` | generated; do not edit |
| `scripts/` | `gen-registry.ts` and `gen-json-schema.ts` (generated files), `export-fixtures.ts` (captures to scrubbed fixtures) |

## Scripts

Run from this folder, or from the repo root through `bun --filter @homelab/harness-hooks <script>`.

| Script | What |
| --- | --- |
| `bun run build` | `dist/` for Node: ESM `.js` and `.d.ts`, `.ts` specifiers rewritten to `.js` |
| `bun run gen` | regenerate `handlers/index.ts`, `schemas.ts` and `schemas/` after a schema change |
| `bun run gen:check` | fail if any generated file is stale |

## Tests

`test/` checks what the library ships, as it ships:

- `generated.test.ts`: generated files match their generators.
- `shim-node.test.ts`: the shim run with `node` against a stub endpoint, and failing open with no server.
- `node-build.test.ts`: builds `dist/`, has `node` import the package by name (it must resolve to `dist/`), and runs every fixture
  through `handle()`; each answer must equal its `.expected.json`.

The behaviour over HTTP (contract suite, per-event cases, privacy) is tested in the server package against the real server.
