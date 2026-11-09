# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org).

## Unreleased

### `@stateforge-labs/harness-hooks`

- Export the zod schemas, enums, hook names and tool inputs of every harness from the index.
- Tool name constants expanded for Claude, Codex and OpenCode, with the names each harness and version emits.

### `@stateforge-labs/harness-adapters`

- The package is public. It has one subpath per harness (`claude`, `codex`, `opencode`), the OpenCode store reader (`opencode/store`) and the TUI chrome (`tui`).
- OpenCode parts and messages: `parsePart()` and `parseMessage()` report unseen types and statuses as issues, `isToolInFlight()` and `humanText()`. `openOpencodeStore()` reads the database read-only with `node:sqlite` and returns `null` when it cannot open it.
- Tool facts per harness: `toolClass()` (shell, read, edit, web, agent, other) and `toolTarget()` (the file or pattern a tool acts on). Codex exec sources are parsed for shell, apply_patch and web uses.
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
