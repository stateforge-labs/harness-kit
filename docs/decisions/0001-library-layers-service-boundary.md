# The boundary between harness-hooks and its consumers is the middleware contract

Status: **proposed** (owner decided three points on 2026-11-07; two are open, see the end). Research: [R-2026-11-07-09](../research/studies/2026-11-07-harness-hooks-in-the-stateforge-runner/README.md) (confidence: medium).

## Context and Problem Statement

harness-hooks started as an external service for developer machines. The owner also wants StateForge's Runner (its agent host) to reuse
it, with one source of truth, no copy-paste, and no merge of the two repositories. StateForge's decisions (allow, refuse with a hint,
hold, continue a stop) come from a control-plane snapshot and cannot live in harness-hooks; the translation of each harness's hook
payloads can. The middleware pipeline (`src/core/pipeline.ts`) is the natural seam.

## Considered Options

From the study: merge into the StateForge repo; a network service called by the sandbox; the control plane calling it; a second
process in the sandbox; a generic onion package for Runner events; share evidence as data and let StateForge write adapters; one
versioned library consumed by StateForge (chosen). Reasons are in the study's "Options rejected" section.

## Decision Outcome

Chosen option: **harness-hooks stays its own repository and exposes one contract, the middleware layer. Everything before a layer
(transport client, decode) and after it (encode) is harness-hooks. The layer itself is the consumer's.** StateForge supplies exactly
one layer that wraps its `SnapshotHookEngine`.

### Who owns what

| harness-hooks (library) | The contract | The consumer |
| --- | --- | --- |
| Adapters: decode, encode, schemas, enums, captured fixtures; shim and OpenCode plugin; `handle()`; `Pipeline`; stock layers; an embeddable endpoint | `Middleware = (ctx, next) => NeutralReply`, registered with `pipeline.use(layer, { timeoutMs?, onFault })` | StateForge: `snapshotLayer(engine)`, its `HarnessPort` adapters, hermetic harness config, MCP bridge wiring, refusal events, the rule on what may listen in a sandbox |
| harness-hooks (service): HTTP front, admission, log, `HOOK_MIDDLEWARE`, installers, the built-in rules text as a layer | | The developer: their own layers through `HOOK_MIDDLEWARE` |

### The contract, version 1 (to be built; shapes are proposals)

- `HookContext.event` gains `session` and `tool { name, callId }`. The arguments are not part of it: StateForge's engine never reads them.
- `NeutralReply` gains `deny { reason, hint? }` and `continue { missing: string[] }`. Each adapter encodes them by its harness's rules.
- **Deny wins.** A layer above cannot remove a deny that came from below; `continue` beats `context`.
- **Per-layer failure mode.** `onFault: "skip"` (default; the service) or `{ deny: { reason, hint? } }` (StateForge: `state-unavailable`). If the pipeline itself throws, `handle()` encodes that layer's deny instead of an empty answer.
- **Per-layer timeout**, and a written ordering rule: engine bound < layer timeout < shim timeout < harness hook timeout, each with a margin.
- **The built-in policy is the service's layer, not the pipeline's.** A consumer builds a pipeline without it.
- **Per-run state belongs to the consumer.** StateForge composes a new pipeline per attempt, so a stop counter or "already injected" flag lives in the layer's closure. The library keeps no session store for it.
- **Stock layers** (optional export): `stopGuard({ limit })`, `once(inject)`, `stripToolPrefix(prefix)`. StateForge passes 3, its session text and `mcp__sf__`.

### Owner decisions recorded 2026-11-07

1. **Failure mode: per-layer `onFault`**, with deny-wins composition. (Chosen from the offered options.)
2. **Stock layers: the library ships them.** (Chosen from the offered options.)
3. **Endpoint.** The owner's words: "We need to make easy for the StateForge to serve this from the harness-hooks repo." Neither offered option was picked. **Reading confirmed by the owner (2026-11-07):** the serving code lives in harness-hooks as an embeddable endpoint (a web-standard handler plus thin Node and Bun binders, TCP and unix socket), and StateForge starts it with its pipeline. Whether anything may listen inside an agent sandbox stays StateForge's decision (no rule covers it today).

### Consequences

- Good: one source for decode/encode and for every harness quirk; StateForge's decision logic stays in StateForge; the service and the Runner run the same pipeline code.
- Cost: the library's public surface is versioned (a change to a neutral type or an encode rule is a major version); the HTTP handler must stop depending on Bun and on the service's `ServerConfig`; the OpenCode client must be able to act on an answer (await, then throw or mutate), which is a redesign, not an encoder.
- Cost for StateForge: an ADR for the external dependency and the exception to "agent-host imports nothing but itself" (ADR-0181), and a rule on in-sandbox listeners.

### Confirmation

The contract is real when: a Codex and an OpenCode run against a local MCP server shows hooks fire for MCP calls (study section E); e2e tests drive a `deny` through each harness and see it blocked; a layer that times out under `onFault: deny` is refused, not allowed; a StateForge-shaped fixture layer passes the same fixtures in-process and over the endpoint.

### Order of work

1. The MCP capture (feasibility of Codex and OpenCode under ADR-0420). Nothing is frozen before it.
2. Contract v1 with captures of the deny and stop effects.
3. Stock layers.
4. The library/service cut and the embeddable endpoint (Node-compatible).
5. How StateForge consumes the package (its ADR).

### Still open

- StateForge: package delivery (registry, git tag), the ADR-0181 exception, in-sandbox listeners.
- Captures: Codex deny and stop-block, OpenCode deny and prompt-submit context, MCP tool names and failed-call hooks.
