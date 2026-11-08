# The boundary between harness-hooks and its consumers is the middleware contract

Status: **proposed** (the maintainers decided three points on 2026-11-07; two are open, see the end). Evidence: a 2026-11-07 study of reusing the hook server inside an agent host (confidence: medium).

## Context and Problem Statement

harness-hooks started as an external service for developer machines. The StateForge team also wants StateForge's Runner (its agent host) to reuse
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

### The contract, version 1 (built in phase 3, 2026-11-07; the matrix and timeout table are in `docs/architecture.md`, "Contract v1")

- `HookContext.event` gains `session` (string or null) and `tool { name, callId }` (callId null when the payload has none). The arguments are not part of it: StateForge's engine never reads them.
- `NeutralReply` gains `deny { reason, hint? }`, `continue { reason, missing? }` and `allow`. **Changed from the proposal:** `continue` carries a `reason`, because Claude Code and Codex require a reason string on a stop block and OpenCode needs the text of the synthetic message; with only `missing[]` the adapter would be writing policy prose. `allow` is new: a headless Codex run needs `PermissionRequest` answered allow to call an MCP tool at all . Each adapter encodes the fields by its harness's rules, only on the events where they mean something; a deny on a stop event is never encoded (a block means "go on").
- **Deny wins.** A layer above cannot remove a deny that came from below (the pipeline puts it back); `continue` beats `context`; deny beats allow.
- **Per-layer failure mode.** `pipeline.use(layer, { timeoutMs, onFault })`: `onFault: "skip"` (default; the service) or `{ deny: { reason, hint? } }` (StateForge: `state-unavailable`). If decode or the pipeline itself throws, `handle()` encodes the outermost such layer's deny instead of an empty answer.
- **Per-layer timeout, own work only.** A layer's clock stops while it waits on `next()`, so a slow layer below cannot make a healthy deny-on-fault layer above it refuse. The ordering rule is: engine bound < layer timeout, and the sum of layer timeouts < shim or plugin timeout (now 5000 ms by default) < harness hook timeout, each with a margin.
- **Fail-closed clients (opt-in).** `HOOK_SHIM_FAIL=closed` and `HOOK_PLUGIN_FAIL=closed` refuse the pre-tool call (and, for the shim, `PermissionRequest`) when the server does not answer, instead of `{}`.
- **The built-in policy is the service's layer, not the pipeline's.** A consumer builds a pipeline without it.
- **Per-run state belongs to the consumer.** StateForge composes a new pipeline per attempt, so a stop counter or "already injected" flag lives in the layer's closure. The library keeps no session store for it.
- **Stock layers** (optional export): `toolAllowlist({ allow, deny })` (built with contract v1: the second line behind built-ins off, refusing Codex `request_user_input`, maintainers' decision 2026-11-07); `stopGuard({ limit })`, `once(inject)`, `stripToolPrefix(prefix)` (phase 4). StateForge passes 3, its session text and `mcp__sf__`.

### Maintainer decisions recorded 2026-11-07

1. **Failure mode: per-layer `onFault`**, with deny-wins composition. (Chosen from the offered options.)
2. **Stock layers: the library ships them.** (Chosen from the offered options.)
3. **Endpoint.** The request: "We need to make easy for the StateForge to serve this from the harness-hooks repo." Neither offered option was picked. **Reading confirmed by the maintainers (2026-11-07):** the serving code lives in harness-hooks as an embeddable endpoint (a web-standard handler plus thin Node and Bun binders, TCP and unix socket), and StateForge starts it with its pipeline. Whether anything may listen inside an agent sandbox stays StateForge's decision (no rule covers it today).

### Consequences

- Good: one source for decode/encode and for every harness quirk; StateForge's decision logic stays in StateForge; the service and the Runner run the same pipeline code.
- Cost: the library's public surface is versioned (a change to a neutral type or an encode rule is a major version); the HTTP handler must stop depending on Bun and on the service's `ServerConfig`; the OpenCode client must be able to act on an answer (await, then throw or mutate), which is a redesign, not an encoder.
- Cost for StateForge: an ADR for the external dependency and the exception to "agent-host imports nothing but itself", and a rule on in-sandbox listeners.

### Confirmation

The contract is real when: a Codex and an OpenCode run against a local MCP server shows hooks fire for MCP calls (study section E); e2e tests drive a `deny` through each harness and see it blocked; a layer that times out under `onFault: deny` is refused, not allowed; a StateForge-shaped fixture layer passes the same fixtures in-process and over the endpoint.

Status 2026-11-07: the first three hold for Codex and OpenCode (live runs through the product server, shim and plugin; 146 contract v1 tests). Claude Code's shapes are encoded from its documentation and not yet run live. The StateForge-shaped fixture layer waits for the embeddable endpoint (phase 7).

### Order of work

1. The MCP capture (feasibility of Codex and OpenCode). Nothing is frozen before it.
2. Contract v1 with captures of the deny and stop effects.
3. Stock layers.
4. The library/service cut and the embeddable endpoint (Node-compatible).
5. How StateForge consumes the package (its ADR).

### Still open

- StateForge: package delivery (registry, git tag), the exception to the agent-host import rule, in-sandbox listeners.
- Captures still missing: Codex `SubagentStop` block on a real run (encoded from the pinned schema); every Claude Code shape on a real run (encoded from its documentation); OpenCode prompt-submit context (no encoder in v1).
