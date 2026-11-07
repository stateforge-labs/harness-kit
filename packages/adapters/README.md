# @homelab/harness-adapters

Empty for now. It will run a coding-agent harness (Claude Code, Codex, OpenCode) non-interactively behind one port, so a caller such as
StateForge's Runner knows no harness by name. The Claude adapter moves here from StateForge in phase 5, Codex and OpenCode follow in
phase 6: [`docs/plans/2026-11-07-harness-kit.md`](../../docs/plans/2026-11-07-harness-kit.md). Why it lives in this repo:
[ADR 0002](../../docs/decisions/0002-one-repo-for-hooks-and-non-interactive-adapters.md).

It depends on [`@homelab/harness-hooks`](../hooks/README.md) for the neutral event and reply types. Like that package, its shipped code
must not use a Bun API; `tools/check-boundaries.ts` enforces it.
