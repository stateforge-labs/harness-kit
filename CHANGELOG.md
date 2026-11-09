# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org).

## Unreleased

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
