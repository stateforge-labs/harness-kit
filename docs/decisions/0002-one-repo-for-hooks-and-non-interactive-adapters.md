# One repository, harness-kit, holds the hooks and all harness knowledge

Status: **accepted** (2026-11-08). Amends [ADR 0001](0001-library-layers-service-boundary.md): the harness adapters move from "StateForge owns" to this repository. Widened on 2026-11-08 by the owner: the adapters package also holds transcript and store readers, in-flight and background detection, CLI invocation, usage and context windows, tool facts and TUI screen chrome; Hermes is not modelled; the OpenCode store reader uses `node:sqlite`; the package is public. Evidence: a 2026-11-07 study of reusing the hook server inside an agent host, and a 2026-11-08 audit of tab-recap.

## Context and Problem Statement

StateForge is built on ports and adapters; its harness port (`HarnessPort` in `packages/agent-host`) has one adapter, Claude. The StateForge team
extracts one concern at a time into its own repository to see it clearly, and wants the harness part stripped out of StateForge. The
question was whether the hook-server repository should also hold the harness adapters for non-interactive use.

A 2026-11-08 audit of tab-recap found about 3,100 lines that touch a harness, and about 570 of them are harness knowledge rather than
UI or policy: transcript record formats, rollout rows, the OpenCode store, CLI flags, token fields, tool names and TUI chrome. That
knowledge changes with each harness release and is the same knowledge the hook package already encodes for payloads. It belongs in one
place, not copied into each consumer.

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
  | `@stateforge-labs/harness-hooks` | neutral event and reply, per-harness decode/encode, middleware pipeline, stock layers, shim, OpenCode plugin; zod schemas, enums, hook names and tool inputs of every harness exported from the index (0.2.0) | nothing internal |
  | `@stateforge-labs/harness-adapters` | public. Harness knowledge that is not a hook: transcript and rollout readers, the OpenCode store reader, in-flight and background detection, CLI invocation (argv, output parsing), usage and context windows, tool facts, TUI screen chrome, hermetic launch. One module per harness (`/claude`, `/codex`, `/opencode`, `/tui`), built on `harness-hooks` | `harness-hooks` only |
  | `@stateforge-labs/harness-hooks-server` | the developer hook server for interactive sessions, installers | `harness-hooks` |

- **Hook names, enums and schemas stay in `harness-hooks`** and are exported from its index. `harness-adapters` reads them from there and never copies them.
- **Stays in StateForge:** the snapshot decision layer, prompt and refusal texts, pricing, the session-storage backend, the model relay and
  credentials, images and sandbox policy, and the StateForge contract suite run against these adapters.
- **Split later only** if the adapters need a different release pace, visibility or licence; a history-preserving split is cheap.

### Rules for `harness-adapters`

- **Tolerant readers.** A reader never throws on malformed input. An unknown record type or shape is returned or reported as an issue, never dropped silently.
- **Enums from captures only.** Closed value sets are `z.enum` in `src/<harness>/enums.ts`, observe-only: an unseen value is reported, never thrown. A value is added only when a masked capture shows it.
- **Fixtures are masked captures.** Tests run against masked captures under `fixtures/`, each harness with a `provenance.json`. Hand-written JSON stands in for harness output only when it is marked `synthetic`. No raw capture is committed.
- **Runtime.** Node 22.13 or later and Bun. The shipped code uses only `node:*` modules, never `bun:*` or `Bun.*`. `node:sqlite` is imported only by the OpenCode store module, so other modules load without it.
- **No policy.** Budgets, UI text, timings and product decisions stay in the consumer. The package reports facts (tokens, windows, states), it does not decide what to do with them.

### Not modelled

- **Hermes.** The kit has no `hermes` in `Harness`, and no Hermes reader, launcher or fixture. tab-recap removes its Hermes support in its own later change.

### Confirmation

- The Claude adapter runs from `harness-adapters` under StateForge's agent host and passes StateForge's own contract suite (built-ins off,
  only allowed MCP tools listed, usage reported, resume works) with no Claude name left in `packages/runner`.
- tab-recap's harness readers delete their own copies and pass its tests against `@stateforge-labs/harness-adapters` (tracked outside this repository).

The work plan is [docs/plans/2026-11-07-harness-kit.md](../plans/2026-11-07-harness-kit.md).
