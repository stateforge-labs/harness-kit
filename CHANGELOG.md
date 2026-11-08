# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org). The project is on `0.y.z`, so a minor release may change the API.

## [Unreleased]

### Added

- `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, the GitHub issue forms and a GitLab merge request template.
- A public README for the repository, and README files for each package that describe only what the code does.

## [0.1.0] - not yet released

The first version. It ships the following.

### `@homelab/harness-hooks`

- Neutral hook events and replies, shared by every harness.
- Per-harness decode and encode for Claude Code, Codex and OpenCode, with zod schemas for each event.
- A middleware pipeline with per-layer timeouts and fault modes (`skip` or `deny`), a built-in policy layer and a worktree layer.
- `handle()`, which never throws: a broken adapter answers `{}`.
- The command shim (`@homelab/harness-hooks/shim`), which fails open by default and can fail closed.
- The OpenCode plugin (`@homelab/harness-hooks/opencode-plugin`).
- Captured and synthetic fixtures, and JSON Schema per harness event.
- A Node build in `dist/` for Node 22 or later.

### `@homelab/harness-hooks-server`

- The HTTP server on `POST /hook/<harness>`, with `GET /healthz`.
- Admission by bearer token, or loopback only with loopback `Host` and JSON content type checks.
- A JSONL event log that writes an allowlist of fields, with rotation.
- Graceful shutdown on SIGTERM and SIGINT.
- Middleware modules loaded from `HOOK_MIDDLEWARE`.
- The installer for Claude Code, Codex, OpenCode and the systemd user service.

### `@homelab/harness-adapters`

- Workspace package with no code yet. It is not published.
