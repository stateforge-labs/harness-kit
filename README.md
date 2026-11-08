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
- `tools/` holds dev-only scripts; nothing in a package imports them:
  - `capture-server.ts`: a throwaway research server, not the product. For every request with the bearer `CAPTURE_TOKEN` it appends
    `{ ts, payload }` to `CAPTURE_LOG` (JSONL; a body that is not JSON gives `payload: null`) and `{ ts, event, tool, rule, reply }` to
    `replies.jsonl` beside it. `CAPTURE_RULES` is a first-match list of `{ event, tool?, reply, times?, delayMs? }`: `tool` matches
    `tool_name` (or the body's `tool` for OpenCode), `times` limits uses, and `delayMs` probes a harness's hook timeout.
  - `infer-fields.ts`: measures real payload shapes from `captures/*/events.jsonl` (JSON types seen, how often each key is present, nested up to three levels, including objects inside arrays) and prints them as JSON. Its default input is the Claude hook-surface study's captures.
  - `check-boundaries.ts`: runs before `bun test`. A workspace package may be imported only if declared, and only through a path in its
    `exports` map (no deep imports). Static and string-literal dynamic imports are checked. The shipped code of `hooks` and `adapters` (`src/`, `clients/`) must not import a `bun*` module
    or call `Bun.*`, because StateForge runs them under Node. Exit 0 is clean; exit 1 prints one line per violation; `--root` checks another tree.
