# @homelab/harness-hooks

The library. It turns a hook payload from Claude Code, Codex or OpenCode into a neutral event, runs it through a middleware pipeline,
and turns the neutral reply back into that harness's own response. It has no HTTP server and no Bun API in shipped code, so it runs
under Bun (sources) and Node (`dist/`). The service that puts it behind HTTP is [`@homelab/harness-hooks-server`](../hooks-server/README.md).
How the pieces fit: [`docs/architecture.md`](../../docs/architecture.md). Why it is a library: [ADR 0001](../../docs/decisions/0001-library-layers-service-boundary.md), [ADR 0002](../../docs/decisions/0002-one-repo-for-hooks-and-non-interactive-adapters.md).

## What it exports

| Import | What |
| --- | --- |
| `@homelab/harness-hooks` | `adapters` (registry by harness id), `handle(adapter, raw, pipeline)`, `Pipeline` (with per-layer `{ timeoutMs, onFault }`), `defaultPipeline`, `policyLayer`, `onKinds`, `mergeReplies`, `toolAllowlist`, `denyText`, `continueText`, `policy`, the neutral types (`NeutralEvent`, `NeutralReply`, `HarnessAdapter`, ...), and on-disk paths (`shimPath`, `opencodePluginPath`, `fixturesDir`, `schemasDir`) |
| `@homelab/harness-hooks/shim` | the command shim (stdin to `POST /hook/<harness>`; fails open to `{}`, or with `HOOK_SHIM_FAIL=closed` refuses PreToolUse and PermissionRequest) |
| `@homelab/harness-hooks/opencode-plugin` | the OpenCode plugin (throws on a deny, sends a continue as a synthetic message; fails open, or closed with `HOOK_PLUGIN_FAIL=closed`) |
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
| `clients/` | the shim (runs from the package with Node or Bun) and the OpenCode plugin (bundled into one file by the installer) |
| `fixtures/<harness>/<Event>/` | payloads and snapshots, with a `provenance.json` per harness |
| `schemas/<harness>/` | generated; do not edit |
| `scripts/` | `gen-registry.ts` and `gen-json-schema.ts` (generated files), `export-fixtures.ts` (captures to scrubbed fixtures) |

## Scripts

Run from this folder, or from the repo root through `bun --filter @homelab/harness-hooks <script>`.

| Script | What |
| --- | --- |
| `bun run build` | `dist/` for Node: ESM `.js` and `.d.ts`, `.ts` specifiers rewritten to `.js` |
| `bun run gen` | regenerate `handlers/index.ts`, `schemas.ts` and `schemas/` after a schema change |
| `bun run gen:check` | fail if any generated file is stale; exits 1 listing stale or no-longer-generated files |
| `bun scripts/export-fixtures.ts` | captures to scrubbed fixtures (see below) |

Generators (`scripts/gen-registry.ts`, `scripts/gen-json-schema.ts`, shared helpers in `scripts/lib/emit.ts`):
- An unknown flag is an error, because a silently ignored flag (`--root`) would make a write run rewrite the real tree.
- `--root <dir>` runs against another copy of the tree. The tests run the stale cases on a throwaway copy, and a bad flag next to a stale
  root leaves it untouched.
- Owned directories (`schemas/<harness>/`) hold only generated files, so a write replaces them whole and a check reports unexpected extras.
- Every handler must have a schema and every schema a handler. A file's event name comes from the harness's `names.ts`, so a name that
  cannot be a file name (`tool.execute.before`) is fine.
- The JSON Schemas are documentation only. Their source is the zod schemas, and checks that are code (Claude's per-tool `tool_input`,
  `src/adapters/claude/tool-input.ts`) are not in them.

Fixtures (`scripts/export-fixtures.ts`):
- It keeps one payload per distinct (event, key set, discriminating values). OpenCode body keys act as variant labels; adding them to
  Claude or Codex would regroup those fixtures.
- A re-run replaces the fixtures (they are reproducible from the captures). Hand-made `<nn>-synthetic.json` files and `provenance.json`
  survive it.
- It exports Claude by default and never clears another harness's folder. Codex needs the R-2026-11-07-08 captures folder.
- Each harness's `provenance.json` has a default and per-`<Event>/<name>` overrides: `captured`, or `synthetic (where it came from)`.
- What it scrubs, and why, is [ADR 0004](../../docs/decisions/0004-the-log-is-an-allowlist.md), point 6.

## Tests

`test/` checks what the library ships, as it ships:

- `generated.test.ts`: generated files match their generators.
- `shim-node.test.ts`: the shim run with `node` against a stub endpoint, and failing open with no server.
- `node-build.test.ts`: builds `dist/`, has `node` import the package by name (it must resolve to `dist/`), and runs every fixture
  through `handle()`; each answer must equal its `.expected.json`. The package name is interpolated into the child script, so
  `tools/check-boundaries.ts` does not read it as an import.
- `contract-v1-pipeline.test.ts`: per-layer timeouts and fault modes, deny-wins, `handle()` fail-closed and `toolAllowlist`, in-process,
  because `HOOK_MIDDLEWARE` cannot express layer options.
- `log-meta-keys.test.ts`: for every fixture, a handler's `meta` uses no reserved log line field and repeats a common field only with its
  value (ADR 0004).

The behaviour over HTTP (contract suite, per-event cases, privacy) is tested in the server package against the real server.
