# Contributing

Thanks for looking at harness-kit. This page covers the development setup, the checks a change must pass, the repository layout and
how changes reach the project.

## How changes reach the project

The source of truth is a GitLab project. This GitHub repository is a mirror of it: commits and tags are copied here, and releases are
cut from the source project.

- **Issues.** Open them here. Bug reports and feature requests are welcome, and the issue forms ask for what a maintainer needs.
- **Pull requests.** A maintainer reads the proposal here and reapplies accepted changes in the source project, where they are reviewed
  and merged. The change then comes back through the mirror. The pull request is closed with a link to the mirrored commit.
- **Security issues.** Do not open an issue or pull request for a vulnerability. Follow [SECURITY.md](SECURITY.md).

Keep a change to one concern. Describe what changed and why, and say how you checked it.

## Development setup

You need [mise](https://mise.jdx.dev) (it pins Bun 1.4.4 in [`mise.toml`](mise.toml)) and Node 22 or later for building `dist/`.

```sh
mise install       # Bun 1.4.4
bun install        # the workspace, from bun.lock (the lockfile is exact)
```

`bunfig.toml` pins exact versions and refuses to install a version published less than 14 days ago.

## Checks

Run these from the repository root before you open a pull request.

| Command | What it does |
| --- | --- |
| `bun run test` | `tools/check-boundaries.ts`, then `bun test` for every package |
| `bun run typecheck` | `tsc --noEmit` over `packages/` and `tools/`, using the `bun` export condition |
| `bun run gen:check` | fails if a generated file is stale (the handler index, `schemas.ts` and the JSON Schemas) |
| `bun run build` | builds `dist/` for `@stateforge-labs/harness-hooks` (ESM and `.d.ts`, for Node) |

`tools/check-boundaries.ts` enforces the package boundaries. A workspace package may be imported only if it is declared, and only
through a path in its `exports` map (no deep imports). The shipped code of `hooks` and `adapters` (`src/` and `clients/`) must not
import a `bun*` module or call `Bun.*`, because the library runs under Node. Exit 0 is clean. Exit 1 prints one line per violation.

After a schema change, run `bun run gen` in `packages/hooks`, then review the regenerated files. Do not edit generated files by hand:
`handlers/index.ts`, `schemas.ts` and `schemas/`.

## Tests

- `packages/hooks/test/` checks what the library ships, as it ships:
  - `generated.test.ts`: generated files match their generators.
  - `shim-node.test.ts`: the shim run with Node against a stub endpoint, and failing open with no server.
  - `node-build.test.ts`: builds `dist/`, has Node import the package by name (it resolves to `dist/`), and runs every fixture through
    `handle()`. Each answer must equal its `.expected.json`.
  - `contract-v1-pipeline.test.ts`: per-layer timeouts and fault modes, deny-wins, fail-closed `handle()`, and `toolAllowlist`, in process.
  - `log-meta-keys.test.ts`: for every fixture, a handler's `meta` uses no reserved log field, and repeats a common field only with its value.
- `packages/hooks-server/test/` is end to end only. `test/e2e/harness.ts` spawns `bun src/server.ts`, and every test talks to it over
  HTTP. `contract.test.ts` loops over every harness and fixture, and checks the answer and the log line as recorded (timestamp and
  session id aside). The event cases in `events/<harness>/` cover what is unique to one event.

## Packages

| Path | What |
| --- | --- |
| [`packages/hooks`](packages/hooks/README.md) | `@stateforge-labs/harness-hooks`: the library |
| [`packages/hooks-server`](packages/hooks-server/README.md) | `@stateforge-labs/harness-hooks-server`: the HTTP server and the installers |
| [`packages/adapters`](packages/adapters/README.md) | `@stateforge-labs/harness-adapters`: a private workspace package; not published |

### Library layout (`packages/hooks`)

| Path | What |
| --- | --- |
| `src/core/` | neutral event, reply, policy and the pipeline. Knows no harness |
| `src/port.ts` | the `HarnessAdapter` interface every harness implements |
| `src/adapters/<harness>/` | zod schemas (`events/`), log metadata (`handlers/`), closed value sets (`enums.ts`), the kind table (`neutral.ts`) and the encode rules |
| `clients/` | the shim (runs with Node or Bun) and the OpenCode plugin (bundled into one file by the installer) |
| `fixtures/<harness>/<Event>/` | payloads and snapshots, with a `provenance.json` per harness |
| `schemas/<harness>/` | generated JSON Schemas. Do not edit |
| `scripts/` | `gen-registry.ts` and `gen-json-schema.ts` (generators, with `--check`), `export-fixtures.ts` (captures to scrubbed fixtures), `lib/emit.ts` |

Generators accept `--check` (report stale files, change nothing) and `--root <dir>` (run against another copy of the tree). An unknown
flag is an error, so a mistyped flag cannot make a write run rewrite the real tree.

Fixtures: `scripts/export-fixtures.ts` keeps one payload per distinct (event, key set, discriminating values). A re-run replaces the
exported fixtures and keeps hand-made `<nn>-synthetic.json` files and `provenance.json`. Each harness's `provenance.json` records whether a
fixture was `captured` or `synthetic`, with where it came from.

### Server layout (`packages/hooks-server`)

| Path | What |
| --- | --- |
| `src/server.ts` | `HookServerBuilder` and the entry point |
| `src/http/` | `hook-handler.ts` (routes) and `admission.ts` (token, loopback `Host`, JSON content type) |
| `src/config.ts`, `src/net.ts` | environment validation, and the loopback decision with `ipaddr.js` (no DNS) |
| `src/log.ts`, `src/shutdown.ts` | the JSONL log (an allowlist, rotation) and the drain on SIGTERM and SIGINT |
| `src/middleware-loader.ts` | imports the `HOOK_MIDDLEWARE` modules. A module that fails to import stops the start |
| `scripts/install.ts` | the client installers (`claude`, `codex`, `opencode`, `service`) |
| `scripts/snapshot-responses.ts` | records `.expected.json` and `.log.json` for every fixture from the current server. Run on trusted code only |

## Research tools (`tools/`)

`tools/` holds development scripts. Nothing in a package imports them.

- `capture-server.ts`: a research server, not the product. For every request with the bearer `CAPTURE_TOKEN` it appends `{ ts, payload }`
  to `CAPTURE_LOG` (JSONL; a body that is not JSON gives `payload: null`), and `{ ts, event, tool, rule, reply }` to `replies.jsonl` beside
  it. `CAPTURE_RULES` is a first-match list of `{ event, tool?, reply, times?, delayMs? }`: `tool` matches `tool_name` (or the body's
  `tool` for OpenCode), `times` limits uses, and `delayMs` probes a harness's hook timeout.
- `capture.sh <OutName> "<prompt>"`: runs a headless Claude Code session with its hooks pointed at the capture server, then prints what the server received. Its evidence goes to `captures/<OutName>/`.
- `infer-fields.ts`: measures payload shapes from `captures/*/events.jsonl` (JSON types seen, how often each key is present, nested up to
  three levels, including objects inside arrays), and prints them as JSON.
- `check-boundaries.ts`: see Checks above.

Captures carry the home path, user name and email of the machine they came from. Mask them before you commit them.

## Releases

Releases follow [Semantic Versioning](https://semver.org).

1. Add a version heading with the date to [CHANGELOG.md](CHANGELOG.md).
2. Bump `version` in the package's `package.json`. Only the packages that changed need a bump.
3. Run the checks above, and `npm pack --dry-run` in `packages/hooks` and `packages/hooks-server` to confirm what would ship.
4. Tag the commit `vX.Y.Z` and push the tag.

Publishing runs from a version tag. `.github/workflows/publish.yml` publishes `@stateforge-labs/harness-hooks` to npm, and `ci/publish-gitlab.sh` publishes it to the GitLab registry. The tag must equal `v<version>` for the version in `packages/hooks/package.json`.

## License

MIT. See [LICENSE](LICENSE). A copy is in `packages/hooks/LICENSE` so the npm tarball carries it.

## Style

- Keep comments out of `src/` and `clients/`. Name things so the code explains itself.
- Hook names and environment variables are constants. Every environment variable is read in one module, `packages/hooks/src/env.ts`.
- Use zod schemas for payloads. Closed sets of values live in `enums.ts`.
- A harness-specific detail belongs in `src/adapters/<harness>/`, never in `src/core/`.

## Node and Bun

- Shipped library code (`src/`, `clients/`) runs under Node, so it must not use Bun APIs. The boundary check enforces this.
- The server (`packages/hooks-server`) uses Bun APIs and runs only on Bun.
