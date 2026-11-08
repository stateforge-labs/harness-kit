# One repository, harness-kit, for hooks and the non-interactive harness adapters

Status: **proposed** (2026-11-07). Amends [ADR 0001](0001-library-layers-service-boundary.md): the harness adapters move from "StateForge owns" to this repository. Evidence: a 2026-11-07 study of reusing the hook server inside an agent host.

## Context and Problem Statement

StateForge is built on ports and adapters; its harness port (`HarnessPort` in `packages/agent-host`) has one adapter, Claude. The StateForge team
extracts one concern at a time into its own repository to see it clearly, and wants the harness part stripped out of StateForge. The
question was whether the hook-server repository should also hold the harness adapters for non-interactive use.

## Considered Options

1. Hooks here, adapters in StateForge (ADR 0001 as written).
2. Hooks here, adapters in a third repository.
3. **Hooks and adapters here, as separate packages** (chosen).

## Decision Outcome

Chosen option 3, because the Codex and OpenCode adapters are mostly hook knowledge (payload schemas, deny/continue encodings, the
hermetic home, the shim and plugin) plus a launcher, they depend directly on the hook package, and two repositories would turn every
neutral-type change into two releases and a StateForge bump for a single maintainer.

- **Name: `harness-kit`, scope `@stateforge-labs`**. The repository holds more than hooks; the hook server becomes one binary in it.
- **Packages, with enforced import rules:**

  | Package | Job | May import |
  | --- | --- | --- |
  | `@stateforge-labs/harness-hooks` | neutral event and reply, per-harness decode/encode, middleware pipeline, stock layers, shim, OpenCode plugin | nothing internal |
  | `@stateforge-labs/harness-adapters` | the non-interactive harness port: launch, hermetic config, MCP wiring, stream to events, raw usage, resume | `harness-hooks` |
  | `@stateforge-labs/harness-hooks-server` | the developer hook server for interactive sessions, installers | `harness-hooks` |

- **Stays in StateForge:** the snapshot decision layer, prompt and refusal texts, pricing, the session-storage backend, the model relay and
  credentials, images and sandbox policy, and the StateForge contract suite run against these adapters.
- **Split later only** if the adapters need a different release pace, visibility or licence; a history-preserving split is cheap.

### Confirmation

The Claude adapter runs from `harness-adapters` under StateForge's agent host and passes StateForge's own contract suite (built-ins off,
only allowed MCP tools listed, usage reported, resume works) with no Claude name left in `packages/runner`.

The work plan is [docs/plans/2026-11-07-harness-kit.md](../plans/2026-11-07-harness-kit.md).
