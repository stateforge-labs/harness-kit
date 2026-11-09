# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org).

## Unreleased

### `@stateforge-labs/harness-adapters`

- Tool and env policy: `ToolPolicy` (`builtins`, `mcp`, `settings`, `strict`) with `TOOLS_OFF` and `TOOLS_DEFAULT`, and `EnvPolicy` (`inherit` with an optional transform, or `closed`).
- Per-harness capability cells (`CapabilityName`, `Support`, `isUsable`, `supportWhy`), declared by each built-in driver.
- Billed basis for cost reporting, with the cost capability declared per harness.
- `allowedModes` on `createRuntime` refuses credential modes that the consumer has not allowed.
- `baseUrl` on the Claude and Codex API-key credentials.
- A private working directory per run, removed on close unless kept.
- `./engine` subpath (experimental): the CLI engine contract for building a harness driver.
- `invalid-config` for a driver table that throws, instead of an uncaught exception.
- `./testing` additions: `fakeRuntime` with scripted runs, `calls`, `promptLimit` and `capabilities`; `fakeOutput`; and the driver contract checks.
- **Breaking:** a run with no `tools` option now resolves to `TOOLS_OFF` (no built-in tools, no MCP servers, no user settings). Pass `TOOLS_DEFAULT` to keep the harness defaults.
- **Breaking:** `Hermetic`, `Isolation`, `IsolationSpec`, the `hermetic`, `isolation` and `acceptVersions` options, `Plan.layers`, `Plan.isolation`, `RunOutput.hermetic` and `RunOutput.isolationDir`, `CredentialEvidence.observed` and `verified`, the `isolation-created` and `isolation-removed` library events, the private-home credential reasons and the `version-not-accepted` and `script-exhausted` reasons are removed. Use `tools`, `cwd: { private }` and `env` instead.
- **Breaking:** `opencodeHermeticEnv` is renamed `opencodeToollessEnv`.
- OpenCode: tools-off, settings-sources and ephemeral are now emulated with named leftovers, measured on OpenCode 2.2.6. MCP-none stays unmeasured.
- **Breaking:** the value of `OPENCODE_TOOLLESS_CONFIG` changes from `{"tools":{"*":false},"permission":{"*":"deny"}}` to a `{"permissions":[...]}` list of deny rules built by the new `opencodeDenyConfig()`. Anything that passes the constant to OpenCode now sends the new shape.
- `opencodeSessionListArgs()` and `opencodeSessionDeleteArgs()` now include `--standalone` in the arguments they return.

## harness-hooks 0.2.0, harness-adapters 0.1.0 - 2026-11-09

### `@stateforge-labs/harness-hooks`

- **Breaking:** the package ships only the build: `dist/`, `schemas/`, `README.md` and `LICENSE`. Bun now runs `dist/` too; the `bun` export condition is gone (inside the repository the `stateforge-source` condition points at `src/`).
- **Breaking:** `fixturesDir` and the `./fixtures/*` subpath are removed. The fixtures stay in the repository under `packages/hooks/fixtures/`.
- Export the zod schemas, enums, hook names and tool inputs of every harness from the index.
- The Claude tool-input table is exported as `claudeToolInputs`, with `anyToolInput` (any tool input record) and `checkToolInput` (the refinement for a tool input). These three names have no harness prefix in the index, unlike the other exports of their kind.
- Tool name constants expanded for Claude, Codex and OpenCode, with the names each harness and version emits.

### `@stateforge-labs/harness-adapters`

- The package ships only the build: `dist/`, `README.md` and `LICENSE`.
- The package is public. It has one subpath per harness (`claude`, `codex`, `opencode`), the OpenCode store reader (`opencode/store`) and the TUI chrome (`tui`).
- Claude records: `readClaudeRecords()`, `parseClaudeRecord()`, the record and block types, the Claude enums, `humanPrompt()`, `toolUses()`, compaction helpers (`compactBoundary()`, `compactSummary()`, `compactionFailed()`, `transcriptHasCompactBoundary()`), `isNoise()`, `awaySummary()` and `unwrapPastedContent()`.
- Claude background tasks and sessions: `scanClaudeBackground()` and `claudeSessionIdOfPid()`.
- Claude locate: `claudeHome()`, `claudeProjectsRoot()`, `listClaudeTranscripts()` and `locateClaudeTranscript()`.
- Claude usage and context: `claudeContextUse()`, `claudeContextWindow()` (the `[1m]` marker anywhere in the id selects the 1,000,000 window) and `stripClaudeContextSuffix()`.
- Claude launch: `claudeHeadlessArgs()`, `parseClaudeResult()`, `CLAUDE_BINARY` and `CLAUDE_NESTED_ENV`.
- Codex rollouts: `listRollouts()`, `readRollout()`, `parseRolloutRow()`, `findRolloutByCwd()`, `rolloutMeta()` and `sessionIdOfRolloutPath()`, with the row types and the Codex enums.
- Codex open work: `openWork()` reports open calls, running cells and the turn start.
- Codex exec and usage: `codexExec()`, `codexVersionArgs()`, `parseCodexVersion()`, `readLastMessage()`, `CODEX_UNUSED_FEATURES`, `tokenCounts()` and `contextUsage()`.
- Tool facts for Claude and Codex: `claudeToolClass()`, `claudeToolTarget()`, `codexToolClass()`, `codexToolTarget()` and `parseCodexToolCall()`.
- OpenCode launch: `opencodeArgs()`, `opencodeHermeticEnv()`, `opencodeSessionListArgs()`, `opencodeSessionDeleteArgs()`, `parseSessionList()`, `parseOpencodeStream()` and `readOpencodeStream()`.
- OpenCode usage and catalogue: `messageUsage()`, `modelRef()`, `opencodeModelsFile()` and `readOpencodeCatalogue()`.
- Shared core readers used by every harness module: row parsing, enum observation, unknown tallies and file listing.
- OpenCode parts and messages: `parsePart()` and `parseMessage()` report unseen types and statuses as issues, `isToolInFlight()` and `humanText()`. `openOpencodeStore()` reads the database read-only with `node:sqlite` and returns `null` when it cannot open it.
- Tool facts per harness: `toolClass()` (shell, read, edit, web, agent, other) and `toolTarget()` (the file or pattern a tool acts on). Codex exec sources are parsed for shell, apply_patch and web uses.
- TUI screen chrome per harness: `CLAUDE_TUI_CHROME`, `CODEX_TUI_CHROME`, `OPENCODE_TUI_CHROME`, `tuiChrome()` and `isChromeLine()`. Claude's list is the one the screen reader used; Codex and OpenCode lists come from their idle screens, so a Claude footer is no longer chrome for them.
- `adapterEnv()` resolves `HOME`, `XDG_DATA_HOME` and `CODEX_HOME` with their defaults. It is the only environment reader in the package.

## 0.1.0 - 2026-11-08

The first version. It ships the following.

### `@stateforge-labs/harness-hooks`

- Neutral hook events and replies, shared by every harness.
- Per-harness decode and encode for Claude Code, Codex and OpenCode, with zod schemas for each event.
- A middleware pipeline with per-layer timeouts and fault modes (`skip` or `deny`), a built-in policy layer and a worktree layer.
- `handle()`, which never throws: a broken adapter answers `{}`.
- The command shim (`@stateforge-labs/harness-hooks/shim`), which fails open by default and can fail closed.
- The OpenCode plugin (`@stateforge-labs/harness-hooks/opencode-plugin`).
- Captured and synthetic fixtures, and JSON Schema per harness event.
- A Node build in `dist/` for Node 22 or later.

### `@stateforge-labs/harness-hooks-server`

- The HTTP server on `POST /hook/<harness>`, with `GET /healthz`.
- Admission by bearer token, or loopback only with loopback `Host` and JSON content type checks.
- A JSONL event log that writes an allowlist of fields, with rotation.
- Graceful shutdown on SIGTERM and SIGINT.
- Middleware modules loaded from `HOOK_MIDDLEWARE`.
- The installer for Claude Code, Codex, OpenCode and the systemd user service.

### `@stateforge-labs/harness-adapters`

- Private workspace package, not published.
