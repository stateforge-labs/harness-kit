# harness-hooks architecture

One server receives the hook events of several coding-agent harnesses (Claude Code, Codex, OpenCode), checks what they send, logs
metadata and answers with the harness's own response format. The core knows no harness; each harness is an adapter plugged into one port.

## Request path

```text
harness ──(client)──> POST /hook/<harness> ──> admission ──> adapter.decode ──> policy ──> adapter.encode ──> harness
                                                  │               │                              │
                                              401/403/415   validate + log meta          per-harness output rules
```

| Step | Where | What it does |
| --- | --- | --- |
| Route | `src/http/hook-handler.ts` | `POST /hook/<harness>`; `/hook` alone is the Claude route; `/healthz`; anything else 404/405. |
| Admission | `src/http/admission.ts` | With a token: the bearer must match. Without one: loopback `Host` and a JSON content type (stops DNS rebinding and cross-site posts). Runs **before** the harness lookup, so an unauthenticated caller cannot learn which harnesses exist. |
| Decode | `adapter.decode(raw)` | Validates the payload with the event's zod schema (reports `missing` and `wrong_type`, never rejects), builds the neutral event and the log metadata. |
| Policy | `src/core/policy.ts` | Pure: neutral event + the adapter's rules to a neutral reply (`{ context? }`). |
| Encode | `adapter.encode(reply, raw)` | Turns the reply into the harness's response, following its per-event output rules. |
| Log | `src/log.ts` | One JSONL line per request: harness, event, session, labels and counts. Never prompt text, tool input or output. |

`src/app.ts handle()` wraps decode, policy and encode: if any of them throws, the answer is `200 {}`. A broken adapter never stops an agent.

## The port (`src/port.ts`)

```ts
interface HarnessAdapter {
  id; rules;
  decode(raw): Decoded;           // event | null, known, missing, wrong_type, meta
  encode(reply, raw): unknown;    // the body to send back
  common(raw): Common;            // event, session, agent, tool: the fields every log line carries
  jsonSchemas(): Record<string, unknown>;
}
```

Neutral kinds (`src/core/event.ts`): `session-start`, `session-end`, `prompt-submit`, `pre-tool`, `post-tool`, `post-tool-failure`,
`permission-request`, `subagent-start`, `subagent-stop`, `stop`, `pre-compact`, `post-compact`, `other`. A kind comes from the native
event **name** only, so a damaged payload never changes it. A subagent spawn is a `pre-tool` event with an optional `spawn { brief, model }`.
A native event with no shared meaning is `other`: it is still validated, logged and answered.

## Adapters

Each lives in `src/adapters/<harness>/`: `adapter.ts`, `common.ts` (envelope keys), `enums.ts` (every closed value set), `events/<Event>.ts`
(zod schema), `handlers/<Event>.ts` (log metadata), `neutral.ts` (kind table), `spawn.ts`. `scripts/gen-registry.ts` generates
`handlers/index.ts` and `schemas.ts`; `scripts/gen-json-schema.ts` writes `docs/schemas/<harness>/`.

| | Claude Code | Codex | OpenCode |
| --- | --- | --- | --- |
| Transport | HTTP hooks in settings; `clients/shim` for SessionStart and Setup (cannot be http) | command hooks via `clients/shim/hook-shim.ts --harness codex` | `clients/opencode/plugin.ts` (in-process, POSTs) |
| Events | 33 | 14 | 14 (5 hooks, 9 lifecycle events) |
| Event name in the body | `hook_event_name` | `hook_event_name` | `hook_event_name` set by the plugin (`tool.execute.before`) |
| Spawn tool | `Agent` (`subagent_type`, `model`) | `collaborationspawn_agent` (`message`; model unresolved) | `subagent` (`prompt`, optional `model`) |
| Answers | Rules text for Delegation (model-specific) | `{}` (passive) | `{}` (passive; the plugin ignores answers) |
| Fixtures | 82, captured | 23 (22 captured, 1 synthetic) | 23 (19 captured, 4 synthetic) |
| Evidence | R-2026-11-07-03, -05 | R-2026-11-07-04, -08 | R-2026-11-07-04, -08 |

Codex and OpenCode are answered passively on purpose: the wording of their rules is the user's decision and is not made yet.

### Validation never rejects

A schema reports; it does not decide. A missing key, a wrong type or a value outside a closed set is written to the log
(`missing`, `wrong_type: ["path: expected string"]`, `["path: invalid_value"]`) and the request is answered as usual, because a new
harness version must never stop an agent. Value sets are zod enums in one `enums.ts` per harness; a set that was only "seen so far" says so.

## Configuration (`src/config.ts`)

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

Loopback is decided by `src/net.ts` with `ipaddr.js` (`range() === "loopback"`) after the URL parser has split `host[:port]`; only canonical spellings are accepted (`localhost`, `127.x.y.z`, `[::1]`), and `127.1`, `user@localhost`, `app.localhost` and `0.0.0.0` are refused. No DNS lookup is ever made.
`HookServerBuilder` (`src/server.ts`) wires config, adapters and the handler; `src/shutdown.ts` drains the log on SIGTERM/SIGINT.

## Tests

End-to-end only: the real server over HTTP (`test/e2e/harness.ts`). One fixture folder per harness (`test/fixtures/<harness>/<Event>/NN-label.json`,
with `.expected.json` and `.log.json` snapshots and a `provenance.json`: `captured` or `synthetic (...)`). `test/e2e/contract.test.ts` loops over the
adapter registry, so a new harness gets the same checks for free: answered as recorded, log line byte for byte, every required key reported
missing, a retyped key reported, a value outside a set reported, no typed text in the log. Per-event files (`test/e2e/events/<harness>/`) hold only what
is unique to an event. The one deliberate deviation is `test/e2e/opencode-plugin.test.ts`, which drives the plugin with a fake context
against the real server (OpenCode cannot be started in the suite without a model login).

## Unresolved (kept, with what would settle each)

| Unresolved | Settles it |
| --- | --- |
| Codex `PermissionRequest` real payload | Interactive Codex session that triggers an approval |
| Codex spawn: can a model be requested, under which key | Capture with a prompt that names a subagent model |
| Codex hook timeout, merge order, failure modes; `hookEventName` mandatory in output | Timed runs; a run that answers with context |
| The Codex and OpenCode context-answer path (no policy produces one; an encoder mutation survives) | Rules wording decided, then a real run |
| OpenCode root `session.created`, compaction hook and events, `deny`/`ask` effects, failed tool status | See R-2026-11-07-08, Open questions |
| Rules wording for Codex and OpenCode | The user |
| Shim fail-closed variants | A policy that needs to block |
