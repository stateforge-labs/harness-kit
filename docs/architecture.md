# harness-kit architecture

This page spans the packages. Each package's own README says what it exports, its scripts and its tests:
[`@homelab/harness-hooks`](../packages/hooks/README.md) (library), [`@homelab/harness-hooks-server`](../packages/hooks-server/README.md)
(the HTTP service), [`@homelab/harness-adapters`](../packages/adapters/README.md) (empty until phase 5). Paths below are from the repo root.

One server receives the hook events of several coding-agent harnesses (Claude Code, Codex, OpenCode), checks what they send, logs
metadata and answers with the harness's own response format. The core knows no harness; each harness is an adapter plugged into one port.

## Request path

```text
harness ──(client)──> POST /hook/<harness> ──> admission ──> adapter.decode ──> middleware ──> policy ──> adapter.encode ──> harness
                                                  │               │                  (pipeline)                    │
                                              401/403/415   validate + log meta                       per-harness output rules
```

| Step | Where | What it does |
| --- | --- | --- |
| Route | `packages/hooks-server/src/http/hook-handler.ts` | `POST /hook/<harness>`; `/hook` alone is the Claude route; `/healthz`; anything else 404/405. |
| Admission | `packages/hooks-server/src/http/admission.ts` | With a token: the bearer must match. Without one: loopback `Host` and a JSON content type (stops DNS rebinding and cross-site posts). Runs **before** the harness lookup, so an unauthenticated caller cannot learn which harnesses exist. |
| Decode | `adapter.decode(raw)` | Validates the payload with the event's zod schema (reports `missing` and `wrong_type`, never rejects), builds the neutral event and the log metadata. |
| Middleware | `packages/hooks/src/core/pipeline.ts` | The layers registered with `HookServerBuilder.use()` or `HOOK_MIDDLEWARE`; the built-in policy is always the innermost one (see Middleware below). |
| Policy | `packages/hooks/src/core/policy.ts` | Pure: neutral event + the adapter's rules to a neutral reply (`{ context? }`). |
| Encode | `adapter.encode(reply, raw)` | Turns the reply into the harness's response, following its per-event output rules. |
| Log | `packages/hooks-server/src/log.ts` | One JSONL line per request: harness, event, session, labels and counts. Never prompt text, tool input or output. |

`packages/hooks/src/handle.ts` `handle()` wraps decode, the pipeline and encode: if any of them throws, the answer is `200 {}`. A broken adapter never stops an agent.
The exception is a pipeline built to fail closed (a layer with `onFault: { deny }`): if decode or the pipeline throws, `handle()` encodes that deny.

## Middleware (`packages/hooks/src/core/pipeline.ts`)

Every event passes through a pipeline between decode and encode. A layer is `(ctx, next) => NeutralReply`, where `ctx` is the neutral
`event`, the adapter's `rules` and the native payload `raw` (read-only; it holds prompts and tool input, so never log or forward it whole).

- **Order is outside-in, like Koa.** The first layer registered runs first and wraps the rest; `policyLayer` is added last, so it is
  always the innermost and every layer can see and change what the policy said.
- **A layer can** call `next()` and add to its reply, replace it, or not call `next()` and answer alone. `next()` is memoised: calling it
  twice runs the layers below once. `mergeReplies` joins two contexts with a blank line; `onKinds(kinds, mw)` limits a layer to some events.
- **Fault mode per layer.** `pipeline.use(layer, { timeoutMs, onFault })`. A layer that throws, rejects or works longer than its timeout
  is, with `onFault: "skip"` (the default, and the only mode `HOOK_MIDDLEWARE` layers get), skipped: the answer is what the layers below
  decided, so a broken layer never stops an agent. With `onFault: { deny: { reason, hint? } }` the answer is that deny (StateForge's
  `state-unavailable`). Faults go to `PipelineOptions.onFault` (stderr by default).
- **A layer's timeout counts only its own work.** The clock stops while the layer waits on `next()` and starts again when the layers below
  answer, so a slow layer below cannot trip the timeout of a healthy one above it. The worst case for one event is the sum of all layer
  timeouts; that sum is what the timeout ordering below compares.
- **Deny wins.** Whatever a layer returns, a deny that came from the layers below it stays in the answer (the pipeline puts it back).
  This holds for layers that call `next()`: an outer layer that answers alone never runs the layers below it, so a layer that must
  always be consulted (StateForge's snapshot layer) is registered outermost.
  `mergeReplies(below, mine)` keeps `below`'s deny and continue, joins the contexts and keeps `allow` from either.
- **Two ways in.** In code: `new HookServerBuilder().use(mw)`. In a running server: `HOOK_MIDDLEWARE=/abs/a.ts,/abs/b.ts`, each module's
  default export a `Middleware` or an array of them; a module that fails to import is a start-up error (exit 2). Module loading runs
  arbitrary code and is a service feature only (R-2026-11-07-09).
- **Same layer, every harness.** A layer returns a `NeutralReply`; each adapter encodes it by its own rules (the matrix below), so one
  layer reaches all three harnesses.

## Contract v1 (ADR 0001)

The neutral event carries `session` (the harness's session id or null) and, on tool events, `tool { name, callId }`. `callId` is
`tool_use_id` on Claude Code and Codex (on Codex it equals the MCP `_meta.callId`, R-2026-11-07-10 F17), and on OpenCode the hook's `id`
(`source.id` on `permission.evaluate`): the model's tool-call id, which never reaches an MCP server, and which calls made inside codemode's
`execute` share with the outer call. Tool arguments are not on the event.

`NeutralReply` is `{ context?, deny?: { reason, hint? }, continue?: { reason, missing? }, allow?: true }`. The consumer writes all prose;
the adapters only lay it out: a deny is `reason`, then `hint` on its own line (`denyText`); a continue is `reason`, then `- item` per
missing item (`continueText`).

### What each reply field becomes

| Neutral kind (native) | `deny` | `allow` | `continue` | `context` |
| --- | --- | --- | --- | --- |
| pre-tool, Claude/Codex `PreToolUse` | `hookSpecificOutput { hookEventName, permissionDecision: "deny", permissionDecisionReason }`; wins over context | not encoded (it would skip the user's own permission prompts) | not encoded | `hookSpecificOutput.additionalContext` |
| pre-tool, OpenCode `tool.execute.before` | `{ deny: text }`; the plugin throws it | not encoded | not encoded | not encoded |
| permission-request, Claude/Codex `PermissionRequest` | `hookSpecificOutput { hookEventName, decision: { behavior: "deny", message } }` | `hookSpecificOutput { hookEventName, decision: { behavior: "allow" } }`; deny wins | not encoded | not encoded |
| permission-request, OpenCode `permission.evaluate` | not encoded in v1 (the pre-tool deny refuses the call) | not encoded | not encoded | not encoded |
| stop, Claude/Codex `Stop`; subagent-stop, Claude/Codex `SubagentStop` | **not encoded**: a block means "go on", the opposite of a deny | not encoded | `{ decision: "block", reason }` | not encoded (context on Stop is itself a continuation) |
| stop, OpenCode `session.experimental.idle` | not encoded | not encoded | `{ continue: text }`; the plugin sends it as a synthetic user message, at most `HOOK_PLUGIN_MAX_CONTINUES` (8) times in a row per session | not encoded |
| session-start, subagent-start (Claude, Codex); prompt-submit (Codex) | not encoded | not encoded | not encoded | `hookSpecificOutput.additionalContext`, as before v1 |
| every other event | not encoded | not encoded | not encoded | not encoded |

Evidence per row, by harness:

| Shape | Claude Code | Codex 0.167.0 | OpenCode 2.2.6 |
| --- | --- | --- | --- |
| pre-tool deny | documented (Claude Code hook-surface study specs) | captured, `codex/q4-deny-and-stop` (R-2026-11-07-10); live through the product, `codex/v1-live-deny-continue` (F20) | captured, `opencode/q4-throw-deny`; live, `opencode/v1-live-deny-continue` (F20) |
| permission-request allow | documented | captured, `codex/q1-permission-allow` | n/a |
| permission-request deny | documented | live, `codex/v1-live-perm-deny` (R-2026-11-07-10 F20) | n/a |
| stop continue | documented | captured, `codex/q4-deny-and-stop` | captured, `opencode/q4-idle-continue` |
| subagent-stop continue | documented | pinned output schema | n/a |

### Timeout ordering

Each stage must give up before the one that called it, with a margin, or the caller decides first:

**sum of layer timeouts < shim or plugin timeout < harness hook timeout.**

| Stage | Default | Set by |
| --- | --- | --- |
| A layer's own work | 2000 ms | `LayerOptions.timeoutMs`, `PipelineOptions.timeoutMs`, `HOOK_MIDDLEWARE_TIMEOUT_MS` |
| The service's pipeline (n `HOOK_MIDDLEWARE` layers + the built-in policy) | at most (n + 1) × `HOOK_MIDDLEWARE_TIMEOUT_MS`; with the defaults, n ≥ 2 already exceeds the shim's 5000 ms, so lower the layer timeout or raise the shim's | |
| Shim (`HOOK_SHIM_TIMEOUT_MS`), plugin (`HOOK_PLUGIN_TIMEOUT_MS`) | 5000 ms | environment |
| Codex handler `timeout` | its own default | `hooks.json`; set it well above the shim's (R-2026-11-07-10 F7: a late Codex hook fails **open**) |
| Claude Code | its own hook `timeout`; PreToolUse goes over HTTP, not the shim, so `HOOK_SHIM_FAIL` does not cover it: Claude's own hook-failure setting (`onFailure: "block"`, per its docs) decides fail-closed there | settings |
| OpenCode | waits as long as the hook takes (75 s seen, R-2026-11-07-10 F14) | none; the plugin's timeout decides |

A pre-tool layer registered with `onFault: { deny }` that times out was refused on a live Codex run (`codex/v1-live-fault-deny`, F20).
When the shim or plugin gives up, it answers `{}` (fail open, the default) or, with `HOOK_SHIM_FAIL=closed` / `HOOK_PLUGIN_FAIL=closed`,
a refusal on the pre-tool events (and on `PermissionRequest` for the shim). An engine that a layer calls (StateForge's snapshot engine)
must have its own bound below that layer's timeout.

### Stock layer

`toolAllowlist({ allow, deny })` (`packages/hooks/src/core/layers.ts`), opt-in: denies pre-tool and permission-request events for a tool
not on the list (or with no tool name), and answers allow on permission-request for a listed tool. It is the second line behind each
harness's built-ins-off configuration (R-2026-11-07-10 F15, F16), and it refuses Codex `request_user_input` and
`request_user_input_async` unless they are listed (owner decision 2026-11-07). Names are the harness's own (`mcp__sf__x` vs `sf_x`).

## The port (`packages/hooks/src/port.ts`)

```ts
interface HarnessAdapter {
  id; rules;
  decode(raw): Decoded;           // event | null, known, missing, wrong_type, meta
  encode(reply, raw): unknown;    // the body to send back
  common(raw): Common;            // event, session, agent, tool: the fields every log line carries
  jsonSchemas(): Record<string, unknown>;
}
```

Neutral kinds (`packages/hooks/src/core/event.ts`): `session-start`, `session-end`, `prompt-submit`, `pre-tool`, `post-tool`, `post-tool-failure`,
`permission-request`, `subagent-start`, `subagent-stop`, `stop`, `pre-compact`, `post-compact`, `other`. A kind comes from the native
event **name** only, so a damaged payload never changes it. A subagent spawn is a `pre-tool` event with an optional `spawn { brief, model }`.
A native event with no shared meaning is `other`: it is still validated, logged and answered.

## Adapters

Each lives in `packages/hooks/src/adapters/<harness>/`: `adapter.ts`, `common.ts` (envelope keys), `enums.ts` (every closed value set), `events/<Event>.ts`
(zod schema), `handlers/<Event>.ts` (log metadata), `neutral.ts` (kind table), `spawn.ts`. `packages/hooks/scripts/gen-registry.ts` generates
`handlers/index.ts` and `schemas.ts`; `packages/hooks/scripts/gen-json-schema.ts` writes `packages/hooks/schemas/<harness>/`.

| | Claude Code | Codex | OpenCode |
| --- | --- | --- | --- |
| Transport | HTTP hooks in settings; `packages/hooks/clients/shim` for SessionStart and Setup (cannot be http) | command hooks via `packages/hooks/clients/shim/hook-shim.ts --harness codex` | `packages/hooks/clients/opencode/plugin.ts` (in-process, POSTs) |
| Events | 33 | 14 | 14 (5 hooks, 9 lifecycle events) |
| Event name in the body | `hook_event_name` | `hook_event_name` | `hook_event_name` set by the plugin (`tool.execute.before`) |
| Spawn tool | `Agent` (`subagent_type`, `model`) | `collaborationspawn_agent` (`message`; model unresolved) | `subagent` (`prompt`, optional `model`) |
| Answers | Rules text for Delegation (model-specific); contract v1 replies | `{}` from the built-in policy (passive); contract v1 replies | `{}` from the built-in policy (passive); deny and continue, acted on by the plugin |
| Fixtures | 82, captured | 23 (22 captured, 1 synthetic) | 23 (19 captured, 4 synthetic) |
| Evidence | R-2026-11-07-03, -05 | R-2026-11-07-04, -08 | R-2026-11-07-04, -08 |

Codex and OpenCode are answered passively on purpose: the wording of their rules is the user's decision and is not made yet.

### Validation never rejects

A schema reports; it does not decide. A missing key, a wrong type or a value outside a closed set is written to the log
(`missing`, `wrong_type: ["path: expected string"]`, `["path: invalid_value"]`) and the request is answered as usual, because a new
harness version must never stop an agent. Value sets are zod enums in one `enums.ts` per harness; a set that was only "seen so far" says so.

## Configuration (`packages/hooks-server/src/config.ts`)

`new ServerConfig(process.env)` validates the whole environment and throws `ConfigError` (exit 2, message never contains the token).

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 8787 | 0 asks the system for a free port |
| `HOOK_HOST` | 127.0.0.1 | non-loopback needs `HOOK_TOKEN` |
| `HOOK_TOKEN` | empty | bearer token; empty means loopback only |
| `HOOK_LOG_FILE` | `./data/events.jsonl` | rotates to `.1` at `HOOK_LOG_MAX_BYTES` (100 MiB) |
| `HOOK_LOG_PAYLOAD` | off | `1` also logs the full payload (debugging only) |
| `HOOK_MAX_BODY_BYTES` | 32 MiB | larger bodies get 413 |
| `HOOK_SHUTDOWN_GRACE_MS` | 5000 | wait for requests in flight before closing |
| `HOOK_MIDDLEWARE` | empty | absolute module paths, comma-separated; each exports a `Middleware` or an array |
| `HOOK_MIDDLEWARE_TIMEOUT_MS` | 2000 | a layer slower than this is skipped |

Loopback is decided by `packages/hooks-server/src/net.ts` with `ipaddr.js` (`range() === "loopback"`) after the URL parser has split `host[:port]`; only canonical spellings are accepted (`localhost`, `127.x.y.z`, `[::1]`), and `127.1`, `user@localhost`, `app.localhost` and `0.0.0.0` are refused. No DNS lookup is ever made.
`HookServerBuilder` (`packages/hooks-server/src/server.ts`) wires config, adapters and the handler; `packages/hooks-server/src/shutdown.ts` drains the log on SIGTERM/SIGINT.

## Tests

Service behaviour is tested end to end only: the real server over HTTP (`packages/hooks-server/test/e2e/harness.ts`). One fixture folder per harness (`packages/hooks/fixtures/<harness>/<Event>/NN-label.json`,
with `.expected.json` and `.log.json` snapshots and a `provenance.json`: `captured` or `synthetic (...)`). `packages/hooks-server/test/e2e/contract.test.ts` loops over the
adapter registry, so a new harness gets the same checks for free: answered as recorded, log line byte for byte, every required key reported
missing, a retyped key reported, a value outside a set reported, no typed text in the log. Per-event files (`packages/hooks-server/test/e2e/events/<harness>/`) hold only what
is unique to an event. The one deliberate deviation is `packages/hooks-server/test/e2e/opencode-plugin.test.ts`, which drives the plugin with a fake context
against the real server (OpenCode cannot be started in the suite without a model login).

The library's own tests (`packages/hooks/test/`) run its shipped files under Node: the shim with `node`, and the built `dist/` imported
by name with every fixture answering its snapshot. `tools/check-boundaries.ts` runs before `bun test` and fails when a package reaches
into another's files, imports an undeclared package, or (hooks, adapters) uses a Bun API in shipped code.

## Unresolved (kept, with what would settle each)

| Unresolved | Settles it |
| --- | --- |
| Codex `PermissionRequest` real payload | Interactive Codex session that triggers an approval |
| Codex spawn: can a model be requested, under which key | Capture with a prompt that names a subagent model |
| Codex hook timeout, merge order, failure modes; `hookEventName` mandatory in output | Timed runs; a run that answers with context |
| The Codex context-answer path on a real run (no built-in policy produces one; the middleware tests exercise the encoder). OpenCode has no answer path | Rules wording decided, then a real run |
| Codex `SubagentStop` block on a real run (encoded from the pinned schema); Claude Code contract v1 shapes on a real run (encoded from the docs) | A live Codex run with a subagent; a `claude -p` run against the server with a deny layer |
| OpenCode `permission.evaluate` effects (deny/ask); a reply field for it | Not needed while the pre-tool deny refuses the call |
| How StateForge consumes the packages (registry, ADR-0181 exception); the split itself is done (ADR 0002, phase 2) | R-2026-11-07-09 follow-ups; plan phase 7 |
| OpenCode root `session.created`, compaction hook and events, `deny`/`ask` effects, failed tool status | See R-2026-11-07-08, Open questions |
| Rules wording for Codex and OpenCode | The user |
