# harness-kit

One place for what a coding-agent harness (Claude Code, Codex, OpenCode) needs from the outside: its hook events turned into one
neutral form and answered in its own format, and, later, running it non-interactively behind one port. Built as small packages so
StateForge reuses them without copying code.

| Package | What |
| --- | --- |
| [`@homelab/harness-hooks`](packages/hooks/README.md) | library: neutral events, per-harness decode/encode, the middleware pipeline, the shim and OpenCode plugin. Runs on Bun and Node |
| [`@homelab/harness-hooks-server`](packages/hooks-server/README.md) | the HTTP hook server and the installer that connects each harness to it |
| [`@homelab/harness-adapters`](packages/adapters/README.md) | non-interactive harness adapters (empty until phase 5) |

```sh
bun install
bun run test        # boundary check, then every package's tests
bun run typecheck
bun run gen:check
bun run build       # dist/ of @homelab/harness-hooks for Node
bun run start       # the hook server
```

- How it fits together: [`docs/architecture.md`](docs/architecture.md)
- Decisions: [`docs/decisions/`](docs/decisions/) · plan: [`docs/plans/2026-11-07-harness-kit.md`](docs/plans/2026-11-07-harness-kit.md) · studies: [`docs/research/`](docs/research/index.md)
- `tools/` holds dev-only scripts (capture server, field inference, `check-boundaries.ts`); nothing in a package imports them.
