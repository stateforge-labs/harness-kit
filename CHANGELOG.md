# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org).

## Unreleased

## harness-hooks 0.3.1 - 2026-11-09

### `@stateforge-labs/harness-hooks`

- The Claude encoder carries context on PostToolUse and PostToolUseFailure.

## harness-adapters 0.4.0 - 2026-11-09

### `@stateforge-labs/harness-adapters`

- Usage output tokens are the cumulative count from the message stream, not the count at message start.
- Added the agent facet: `runtime.agent(id, options)` returns an `Agent` whose `start` yields a stream of `AgentEvent` values and a `settled` result that never rejects. Agent runs use the vendor SDK engine only; a cli agent run is refused as unsupported before anything starts.
- Added the Claude Agent SDK engine, with `@anthropic-ai/claude-agent-sdk` pinned at 0.3.316 as a dependency. It is loaded by a dynamic import at the first agent run, so importing the package or using the one-shot facet never loads it.
- The credential is one api key or token plus a mandatory base URL; the child environment is closed and built only from what the consumer passes. The consumer supplies the working, home, config and tmp directories, and the library creates none of them.
- Hooks: the consumer passes a `harness-hooks` pipeline, and the Claude engine calls it in process through SDK hook callbacks. A denied tool is also reported as a `refused` event. The session context is delivered at the first prompt, because the SDK does not fire SessionStart.
- An MCP endpoint `allow` list is enforced with built-in tools off; `runtime.agent(...)` refuses it, as `invalid-config` on `tools.builtins`, when built-in tools are on.
- An MCP endpoint with a bearer is passed as a header that names an environment variable, so the token never reaches the child's argument list.
- Cancel always resolves: it waits a bounded time for the stream, escalates to `SIGKILL` on the child process group, and the `finished` event carries `tree` (`gone` or `unconfirmed`) so a give-up is visible. Usage is raw per model message; the library computes no cost for agent runs.
- `./testing` additions: `agentContract` (its secret check provokes an echo through the subject's `echo` scenario), `fakeAgentEngine`, `fakeClaudeQuery` with `claudeMessages`, `fakeTranscriptStore` and a scripted Messages API.
- The Claude `base-url` and `mcp-none` sdk cells are supported, and the Claude sdk cells for the agent features are supported, each backed by a dated measurement recorded in `docs/agent.md`, which also lists what was not established. The Codex hook points under the SDK are unmeasured.
- Documentation: `docs/agent.md` (events, options, resume, store, hooks, cancel guarantees and the dated measured cells), `examples/agent/` with a runnable quick start the README repeats, an "Agent runs" section and an SDK cell table in the README, and the agent facet in the architecture page.
- `FakeAgentScript.tree` sets the process tree state a fake run reports. `FakeAgentScript.settleDelayMs` holds the end of a cancelled fake run open. The agent contract's cancel check no longer waits a tick, so a `cancel()` that resolves before the terminal event fails it.
- The transcript store is flushed eagerly.
- StructuredOutput is allowed when an output schema is set.
- `limits.mcpOutputTokens` is applied to the Claude child.
- The transcript store takes a structured key.
- Usage is flushed when a run ends early.
- A result produced before an abort is kept.
- harness-hooks is pinned exactly.

## harness-adapters 0.2.0 - 2026-11-09

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
- **Breaking:** the value of `OPENCODE_TOOLLESS_CONFIG` changes from `{"tools":{"*":false},"permission":{"*":"deny"}}` to a `{"permissions":[...]}` list of deny rules generated by the library. Anything that passes the constant to OpenCode now sends the new shape.
- `opencodeSessionListArgs()` and `opencodeSessionDeleteArgs()` now include `--standalone` in the arguments they return.

## harness-hooks 0.3.0 - 2026-11-09

### `@stateforge-labs/harness-hooks`

- Added the `./endpoint` subpath: `createHookHandler` builds a web-standard `(Request) => Promise<Response>` hook handler with token or loopback admission, and `serveNode` and `serveBun` serve it on a TCP port or a unix socket. A body over `maxBodyBytes` is answered `413`, and the endpoint reads no environment and writes no log. The subpath also exports `AdmissionMode`, `createAdmission` and `isLoopbackHost`.
- Added the stock layers `stopGuard`, `once` and `stripToolPrefix`. `Next` now accepts an optional replacement context, which `stripToolPrefix` uses.
- Added `HandleOptions` with an `onError` callback for `handle`, and an `onError` option on `createHookHandler`.
- Added `renderCurlShim`, which renders a POSIX sh hook shim that posts with curl (over TCP or a unix socket) instead of starting a JavaScript process, with `parseCurlVersion`, `curlSupports`, `pickCurlTokenSource`, `renderCurlTokenFile` and `CURL_MIN_VERSION`. It works with curl 7.55.0 or later and has two token mechanisms: curl 8.3.0 or later reads the token from `HOOK_TOKEN` through `--variable` and `--expand-header`; curl 7.55.0 up to 8.3.0 reads a header file (`tokenSource: "file"`); with no token (loopback or a user-only socket) `tokenSource: "none"` uses neither. The token never reaches curl as an argument. Added the `HOOK_SOCKET` variable name.
- Added: Claude `UserPromptSubmit` replies can now carry `additionalContext` when a layer returns context there; the built-in layers still answer `{}` on that event.
- Added `Handled.reply`: the neutral reply the pipeline produced, including `deny`, so an embedder can react without parsing the harness-specific body.
- Changed: the library no longer logs by default. `handle` and `Pipeline` stay silent unless given `onError` or `onFault`; `@stateforge-labs/harness-hooks-server` passes both and logs as before.

### `@stateforge-labs/harness-hooks-server`

- Changed: the server runs on `createHookHandler` and `serveBun` from the `./endpoint` subpath. `HookServerBuilder.build()` is now asynchronous and returns the running endpoint (`address` and `close()`) instead of the `Bun.serve` server. The `ipaddr.js` dependency is gone.
- Added a k6 load test, `load/hook-load.js`, for 10 and 50 simulated agents (documented in `load/README.md`; k6 2.3.0 is pinned in `mise.toml`).
- Added `HOOK_SOCKET`: serve on a unix socket (created user-only, a stale socket file is removed on start) instead of a TCP port.
- Installer: `--shim auto|curl|ts` picks the curl shim (the default when curl 7.55.0 or later is on PATH) or the TypeScript shim, `--shim-dir` sets where the script is written, and `--socket` points the shim and the service unit at the unix socket. `claude --apply` writes the curl script only. The installer picks the token mechanism from the curl on PATH: the environment mechanism on 8.3.0 or later; on 7.55.0 up to 8.3.0 a header file `harness-hooks-<harness>.header` (mode 0600, next to the script, written from `HOOK_TOKEN` when one is set) or no mechanism when none is set. `--shim curl` and `--socket` stop with a message on curl older than 7.55.0 or no curl, and `auto` then picks the TypeScript shim.

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
