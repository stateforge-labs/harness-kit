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
| Route | `packages/hooks-server/src/http/hook-handler.ts` | `POST /hook/<harness>` (exact shape); `/hook` alone is the Claude route; `/healthz`; anything else 404/405. The adapter registry is a `Map`, so a prototype key in the URL (`/hook/constructor`, `/hook/__proto__`) never resolves to an adapter. |
| Admission | `packages/hooks-server/src/http/admission.ts` | With a token: the bearer must match, and nothing else is needed, because a web page cannot add an `Authorization` header without a CORS preflight. Without one the server is open on loopback, which a page in the user's browser can also reach, so it also requires a loopback `Host` (stops DNS rebinding) and a JSON content type (a cross-site form or no-cors fetch cannot send one). A non-canonical `Host` is 403; one that makes the request URL unparseable is 400; never a 500 or an answer. Runs **before** the harness lookup, so an unauthenticated caller cannot learn which harnesses exist. |
| Decode | `adapter.decode(raw)` | Validates the payload with the event's zod schema (reports `missing` and `wrong_type`, never rejects), builds the neutral event and the log metadata. |
| Middleware | `packages/hooks/src/core/pipeline.ts` | The layers registered with `HookServerBuilder.use()` or `HOOK_MIDDLEWARE`; the built-in policy is always the innermost one (see Middleware below). |
| Policy | `packages/hooks/src/core/policy.ts` | Pure: neutral event + the adapter's rules to context text only. Deny, continue and allow come from consumer layers, never from the policy (ADR 0003). |
| Encode | `adapter.encode(reply, raw)` | Turns the reply into the harness's response, following its per-event output rules. |
| Log | `packages/hooks-server/src/log.ts` | One JSONL line per request: harness, event, session, labels and counts. What may be written is an allowlist ([ADR 0004](decisions/0004-the-log-is-an-allowlist.md)). |

`packages/hooks/src/handle.ts` `handle()` wraps decode, the pipeline and encode: if any of them throws, the answer is `200 {}`. A broken adapter never stops an agent.
The exception is a pipeline built to fail closed (a layer with `onFault: { deny }`): if decode or the pipeline throws, `handle()` encodes that deny.

**The log writer.**
- Every write goes through one chain, so appends never overlap and a rotation never races an append. One failed write does not break the
  chain, and write failures never reach the hook response.
- The line is built before it is queued, so the queue holds small strings and not request bodies.
- Rotation keeps one old generation (`.1`), so disk use stays near twice `HOOK_LOG_MAX_BYTES`; one line bigger than the cap is written on
  its own. The main file is briefly absent between the rename and the next append. A failed rotation keeps appending and says so on stderr.

**Shutdown** (`packages/hooks-server/src/shutdown.ts`).
- On SIGTERM or SIGINT the server stops accepting, flushes the queued log lines and exits 0.
- Requests still open after `HOOK_SHUTDOWN_GRACE_MS` are closed and the exit code is 1; the queued lines are written either way.
- A second signal exits at once.

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
- **A throwing fault reporter is contained.** `PipelineOptions.onFault` (default `console.error`) is called inside a try/catch, so a
  reporter that throws cannot change the answer or break the pipeline; its error is dropped (`contract-v1-pipeline.test.ts`).
- **Deny wins.** Whatever a layer returns, a deny that came from the layers below it stays in the answer (the pipeline puts it back).
  This holds for layers that call `next()`: an outer layer that answers alone never runs the layers below it, so a layer that must
  always be consulted (StateForge's snapshot layer) is registered outermost.
  `mergeReplies(below, mine)` keeps `below`'s deny and continue, joins the contexts (below first) and keeps `allow` from either; that is safe because no adapter encodes allow next to a deny.
- **Order through the server.** With `HOOK_MIDDLEWARE=A,B`, B is inside A, so B's text is added first and A's last.
- **Two ways in.** In code: `new HookServerBuilder().use(mw)`. In a running server: `HOOK_MIDDLEWARE=/abs/a.ts,/abs/b.ts`, each module's
  default export a `Middleware` or an array of them; a module that fails to import, or exports anything else, is a start-up error naming the file (exit 2), never a silent skip. Module loading runs
  arbitrary code and is a service feature only (R-2026-11-07-09).
- **Same layer, every harness.** A layer returns a `NeutralReply`; each adapter encodes it by its own rules (the matrix below), so one
  layer reaches all three harnesses. Tool names still differ per harness (`mcp__sf__submit` on Claude Code and Codex, `sf_submit` on
  OpenCode), so a layer that matches tool names is built once per harness.

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
| permission-request, Claude/Codex `PermissionRequest` | `hookSpecificOutput { hookEventName, decision: { behavior: "deny", message } }` | `hookSpecificOutput { hookEventName, decision: { behavior: "allow" } }`; deny wins. Only `behavior` and `message` are ever written: Codex fails closed on `updatedInput`, `updatedPermissions` or `interrupt: true` (pinned output schema) | not encoded | not encoded |
| permission-request, OpenCode `permission.evaluate` | not encoded in v1 (the pre-tool deny refuses the call) | not encoded | not encoded | not encoded |
| stop, Claude/Codex `Stop`; subagent-stop, Claude/Codex `SubagentStop` | **not encoded**: a block means "go on", the opposite of a deny | not encoded | `{ decision: "block", reason }` | not encoded (context on Stop is itself a continuation) |
| stop, OpenCode `session.experimental.idle` | not encoded | not encoded | `{ continue: text }`; the plugin sends it as a synthetic user message, at most `HOOK_PLUGIN_MAX_CONTINUES` (8) times in a row per session (the cap Claude Code puts on Stop continuations), so a layer that always says continue cannot loop forever. The count resets when an idle is not continued; a failed continuation lets the session stop. Idle is the stop point because OpenCode awaits that hook; `session.execution.*` are events the plugin cannot answer | not encoded |
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
| Claude Code | its own hook `timeout` (the installer writes 10 s); a non-2xx or unreachable http hook is non-blocking by default. PreToolUse goes over HTTP, not the shim, so `HOOK_SHIM_FAIL` does not cover it: fail-closed there is Claude's own `onFailure: "block"` (per its docs) | settings |
| OpenCode | waits as long as the hook takes (75 s seen, R-2026-11-07-10 F14) | none; the plugin's timeout decides |

A pre-tool layer registered with `onFault: { deny }` that times out was refused on a live Codex run (`codex/v1-live-fault-deny`, F20).
When the shim or plugin gives up, it answers `{}` (fail open, the default) or, with `HOOK_SHIM_FAIL=closed` / `HOOK_PLUGIN_FAIL=closed`,
a refusal on the pre-tool events (and on `PermissionRequest` for the shim). An engine that a layer calls (StateForge's snapshot engine)
must have its own bound below that layer's timeout.

### Stock layer

`toolAllowlist({ allow, deny })` (`packages/hooks/src/core/layers.ts`), opt-in: denies pre-tool and permission-request events for a tool
not on the list (or with no tool name), without asking the layers below (their deny would win anyway), and answers allow on
permission-request for a listed tool. It is the second line behind each
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

Each lives in `packages/hooks/src/adapters/<harness>/`: `adapter.ts`, `names.ts` (every hook name and the spawn tool name, as constants), `output.ts` (Claude, Codex: where each reply field goes), `common.ts` (envelope keys), `enums.ts` (every closed value set), `events/<Event>.ts`
(zod schema), `handlers/<Event>.ts` (log metadata), `neutral.ts` (kind table), `spawn.ts`. `packages/hooks/scripts/gen-registry.ts` generates
`handlers/index.ts` and `schemas.ts`; `packages/hooks/scripts/gen-json-schema.ts` writes `packages/hooks/schemas/<harness>/`.

| | Claude Code | Codex | OpenCode |
| --- | --- | --- | --- |
| Transport | HTTP hooks in settings; `packages/hooks/clients/shim` for SessionStart and Setup (cannot be http) | command hooks via `packages/hooks/clients/shim/hook-shim.ts --harness codex` | `packages/hooks/clients/opencode/plugin.ts` (in-process, POSTs) |
| Events | 33 | 14 | 14 (5 hooks, 9 lifecycle events) |
| Event name in the body | `hook_event_name` | `hook_event_name` | `hook_event_name` set by the plugin (`tool.execute.before`) |
| Spawn tool | `Agent` (`subagent_type`, `model`) | `collaborationspawn_agent` (`message`; model unresolved) | `subagent` (`prompt`, optional `model`) |
| Answers | Rules text for Delegation (model-specific); contract v1 replies | Rules text for Delegation on `SessionStart` and `SubagentStart` (no model named); contract v1 replies | `{}` from the built-in policy (passive); deny and continue, acted on by the plugin |
| Fixtures | 82, captured | 23 (22 captured, 1 synthetic) | 23 (19 captured, 4 synthetic) |
| Evidence | R-2026-11-07-03, -05 | R-2026-11-07-04, -08 | R-2026-11-07-04, -08 |

Rules text exists for Claude and Codex; every other event of theirs is answered passively
([ADR 0003](decisions/0003-the-server-observes-and-never-blocks-on-its-own.md)). Codex's rules are Claude's without the Claude-only
parts (the Haiku model, forks, the advisor) and name no model, because whether a Codex spawn can request one is unresolved. OpenCode
stays passive until its plugin has a context path (see Unresolved); its rules will use the same wording.

### Claude Code notes

- **Per-tool `tool_input`** (`tool-input.ts`): shapes come from the 27 `PreToolUse` captures plus the other tool events. The keys listed
  are the ones every captured call carried; extra keys are allowed, and an unlisted tool accepts any object. `tool_response` differs per
  tool and is never inspected; it only has to be present where the event carries it. These checks are code, so the generated JSON Schema
  does not include them.
- **Fields typed looser than the captures** (so they never log a false `wrong_type`; R-2026-11-07-05):
  - `PreModelSwitch`/`PostModelSwitch` `from_model` may be null. It was always a string in the 4 `PreModelSwitch` and 3 `PostModelSwitch`
    payloads, so null is unresolved.
  - `SubagentStop` `last_assistant_message` is optional: seen in 20 of 21 payloads, so judged required, but one capture lacked it.
  - `UserPromptExpansion` `prompt_id` and `permission_mode` are optional (the spec marks them so), though every capture had them.
- **What a reply can do per event** (from the hook specs; "measured" means a capture showed it). The handlers use none of this beyond the
  three context events:

| Event | What a reply can do | Measured |
| --- | --- | --- |
| `SubagentStart` | context only; cannot block | `systemMessage` shows only as a subagent-transcript `hook_system_message` and never reaches the model; `continue: false` does not stop the subagent (captures SubagentStart-1, -4, -5). Strings over 10,000 chars are spilled to a file, not truncated |
| `UserPromptExpansion` | block or add context | `hookSpecificOutput.additionalContext` is injected (UserPromptExpansion-8); a top-level `additionalContext` is not (-9) |
| `TaskCreated` | exit 2 or `decision: "block"` cancels the task; `additionalContext` is not a documented output | block cancels (TaskCreated-5) |
| `TaskCompleted` | `continue: false` only from a teammate turn-end; ignored when `TaskUpdate` triggers the event | capture 7 consistent |
| `PreCompact` | `decision`/`reason` can abort a manual compaction; an HTTP `hookSpecificOutput` is rejected | abort captured |
| `PermissionDenied` | fires only in auto mode, when it denies a tool call (with or without a classifier verdict); only `hookSpecificOutput.retry` is read, and it is ignored when there was no classifier verdict | |
| `StopFailure` | output ignored except `terminalSequence` (interactive only) | |
| `InstructionsLoaded` | async; all JSON output discarded | |
| `CwdChanged` | no decision control | a `hookSpecificOutput` reply was not surfaced (CwdChanged-3) |
| `WorktreeCreate` | over HTTP the answer must carry `worktreePath`, or creation fails | see Unresolved |

### Codex notes

- **Source:** the 13 pinned command input schemas (`*.command.input.schema.json`, openai/codex @ `57e64682f8ef83c09cc868c39010733dd6760805`,
  R-2026-11-07-04) plus real payloads. Fourteen events, because `PreModelRequest` and `PostModelRequest` are the two `oneOf` branches of
  the one `model-request` schema. Neither takes a matcher, and `PreModelRequest` has no keys beyond the shared ones.
- **Envelope:** `session_id`, `transcript_path`, `cwd` and `hook_event_name` are required in all 13 schemas (`model-request` types the path
  as `AbsolutePathBuf`, still a string). Everything else is per event. `turn_id` is a Codex extension that exposes the active turn to
  turn-scoped hooks, not part of the envelope.
- **JSON Schema mapping:**
  - `NullableString` is a required key with a nullable value.
  - A JSON Schema `true` is a required key with any value.
  - A key with a schema default (the `PostModelRequest` counts) is optional.
  - `agent_id` and `agent_type` are required on `SubagentStart` and `SubagentStop`, because those schemas list them, though they are
    optional elsewhere.
  - The `SessionEnd` reason is `const "other"` and the only value seen, but it is typed as a string.
- **Kinds:** `PreModelRequest`, `PostModelRequest` and `Interrupt` have no neutral meaning (`other`).
- **Closed sets seen** (the rest only listed by the schema): `SessionStart` source `startup` and `compact`, compaction trigger `auto`,
  `agent_type` `default`.
- **Spawn:** the brief is read from `tool_input.message` of `collaborationspawn_agent` with plain reads that cannot throw. The model is
  reported null because the one capture named none (R-2026-11-07-08, capture "subagent"); see Unresolved.
- **Output:** `additionalContext` is written only on `PreToolUse`, `SessionStart`, `SubagentStart` and `UserPromptSubmit`. The output
  schemas also define `hookSpecificOutput` for `PostToolUse` and `PermissionRequest`; the adapter writes only the contract v1
  `PermissionRequest` decision there. Every other event, `SessionEnd` included (it has no output schema), is answered `{}`.

### OpenCode notes

- **No typings:** 2.2.6 ships none for its hooks, so every closed set in `enums.ts` is what the R-2026-11-07-08 captures showed, not
  exhaustive:
  - permission effect: only `allow` (every capture ran with `--auto`);
  - tool status: only `completed` (a failed tool call was never captured);
  - interrupt source: only `user` (SIGINT of `opencode run`);
  - permission source type: `tool`;
  - prompt delivery: `steer`.
- **Envelope:** the plugin adds `hook_event_name` (the hook name, `tool.execute.before`, or the event type, `session.created`) and
  `session_id`, a copy of OpenCode's own `sessionID`, so every harness's body has the same session key. The rest is OpenCode's payload or
  event data, untouched:
  - `tool` is the tool name and `agent` the agent name (`build`, `general`);
  - on `permission.evaluate`, `action` names the permission: the tool name for MCP tools (`probe_echo`), or an open set of capability
    names for built-ins (`shell`, `read`, `edit`, `subagent`). The call id is in `source.id`.
- **Kinds:**
  - `session.created` is `session-start` for every session, a subagent's child session included. The log shows a child as `is_child`
    (a parent-session field is present); the kind is not split on it, because a kind comes from the name alone.
  - `session.experimental.idle` is `stop`.
  - `session.execution.started/succeeded/failed/interrupted` are `other`.
- **Failures:** `session.execution.failed` carries `error: { type, message }`. Only `provider.no-route` was captured (capture
  "bad-model", a model that does not exist), and only `error.type` is logged (as `error_type`).
- **Compaction:** the `session.compaction` hook never fired in a capture, and `session.compaction.started/ended/failed` were seen only as
  names in the binary. All four type only the envelope (see Unresolved).
- **Spawn:** tool `subagent`, input `{ agent, description, prompt }`, plus an optional `model` written `provider/model`. Capture
  "subagent-model" asked for `opencode-go/beam-free` and the key arrived with that value.
- **Plugin form:** an object with `id` and `setup(ctx)`, verified on 2.2.6. Registering an unknown hook name does not fail, so a name
  that never fires looks the same as one that works. Only names seen firing are treated as verified (`session.compaction` stays
  registered but unseen). One hook failing to register does not stop the others, and without an event stream the hooks still work.

### Validation never rejects

A schema reports; it does not decide. A missing key, a wrong type or a value outside a closed set is written to the log
(`missing`, `wrong_type: ["path: expected string"]`, `["path: invalid_value"]`) and the request is answered as usual, because a new
harness version must never stop an agent. Value sets are zod enums in one `enums.ts` per harness; a set that was only "seen so far" says so.
A validation result carries dotted paths and expected types, never values, which is why it may be logged. The JSON Schemas under
`packages/hooks/schemas/` are generated from the zod schemas (draft 2020-12) for documentation only; checks that are code are not in them.

## Configuration (`packages/hooks/src/env.ts`)

Every environment variable is named, defaulted and parsed in one module, `packages/hooks/src/env.ts` (`EnvVar`, `EnvDefault`, `FailMode`),
and it is the only file that touches `process.env`. Each consumer gets a typed view of it: `shimEnv()`, `pluginEnv()`, `installEnv()`,
`captureEnv()`, and the server's `new ServerConfig()` (`packages/hooks-server/src/config.ts`), which validates the server's variables with
zod and throws `ConfigError` (exit 2, message never contains the token). Tests set variables with `setEnv()` and spawn children with
`processEnv()`.

Server:

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

Clients (the shim and the OpenCode plugin read them on every call):

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOOK_URL` | `http://127.0.0.1:8787` | the server |
| `HOOK_TOKEN` | empty | bearer token, never printed |
| `HOOK_SHIM_TIMEOUT_MS`, `HOOK_PLUGIN_TIMEOUT_MS` | 5000 | give up after this long |
| `HOOK_SHIM_FAIL`, `HOOK_PLUGIN_FAIL` | `open` | `closed` refuses the pre-tool call (and the shim's `PermissionRequest`) when the server fails |
| `HOOK_SHIM_DENY_REASON`, `HOOK_PLUGIN_DENY_REASON` | `harness-hooks: the hook server did not answer, ...` | the refusal text in closed mode |
| `HOOK_PLUGIN_MAX_CONTINUES` | 8 | continues in a row per session |
| `HOOK_SHIM_DEBUG` | off | `1` says on stderr why the shim failed |

Installer: `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `CODEX_HOME`. Research capture tool (`tools/capture-server.ts`): `CAPTURE_LOG`,
`CAPTURE_TOKEN`, `CAPTURE_RESPONSE`, `CAPTURE_RULES`.

Whole-number settings accept only plain digits inside their range. `""`, `" 80"`, `"0x10"`, `"1.5"` and `"-1"` are refused, because
`Number()` would turn `""` into 0 (a random port), `"0x10"` into 16 and `" 80 "` into 80. `ServerConfig` throws one `ConfigError` listing
every invalid setting (and, separately, refuses a non-loopback host with an empty token), so a `ServerConfig` that exists is a valid one.

Loopback is decided by `packages/hooks-server/src/net.ts` with `ipaddr.js` (`range() === "loopback"`) after the URL parser has split
`host[:port]`. Only canonical spellings are accepted (`localhost` in any case, `127.x.y.z`, `[::1]`). Anything the URL parser would rewrite or add
to is refused rather than interpreted (`127.1`, `0x7f.1`, `2130706433`, `[0:0:0:0:0:0:0:1]`, `[::ffff:127.0.0.1]`, `user@localhost`, a path
or query, `app.localhost`, `0.0.0.0`): real clients send the canonical form, and not guessing keeps the check small. `ipaddr.js` alone
would class the IPv4-mapped form as loopback; the canonical rule refuses it first (`test/e2e/server-config.test.ts`). No DNS lookup is ever made.
`HookServerBuilder` (`packages/hooks-server/src/server.ts`) wires config, adapters and the handler; `packages/hooks-server/src/shutdown.ts` drains the log on SIGTERM/SIGINT.

## Code conventions

- No comments in `packages/` or `tools/`. Why something is the way it is, and the evidence for it, lives in this page, the ADRs and the
  research studies.
- No string literal stands for a hook name, neutral kind, harness id or env variable in logic: hook names come from each harness's
  `names.ts` (`ClaudeHook`, `CodexHook`, `OpenCodeHook`), kinds and harness ids from `packages/hooks/src/core/event.ts` (`Kind`,
  `Harness`), variables from `packages/hooks/src/env.ts`.
- The OpenCode plugin (`packages/hooks/clients/opencode/`: `plugin.ts` entry, `hooks.ts`, `forward.ts`, `continues.ts`, `context.ts`)
  imports the shared modules like any other code; `bun scripts/install.ts opencode --apply` bundles it into one self-contained file,
  `plugins/harness-hooks.js`, because OpenCode loads plugins from its own folder.
- The shim (`packages/hooks/clients/shim/hook-shim.ts`) builds its fail-closed answer with the same encoder the server uses
  (`packages/hooks/src/adapters/hook-output.ts`).

## Tests

Service behaviour is tested end to end only: the real server over HTTP (`packages/hooks-server/test/e2e/harness.ts`). One fixture folder per harness (`packages/hooks/fixtures/<harness>/<Event>/NN-label.json`,
with `.expected.json` and `.log.json` snapshots and a `provenance.json`: `captured` or `synthetic (...)`). `packages/hooks-server/test/e2e/contract.test.ts` loops over the
adapter registry, so a new harness gets the same checks for free: answered as recorded, log line as recorded (timestamp and session id aside), every required key reported
missing, a retyped key reported, a value outside a set reported, no typed text in the log. Per-event files (`packages/hooks-server/test/e2e/events/<harness>/`) hold only what
is unique to an event.

The contract suite guards against a vacuous pass: every event whose schema has an enum key is exercised at least once (all fixtures are
scanned, because an optional enum key may be absent from the first), and an adapter with no fixtures is skipped, not passed. Snapshots pin
the server's behaviour, so a schema or refactor change cannot alter an answer without a visible diff; regenerate them only from trusted code.
Fixture ids repeat across harnesses, so log lines are matched by harness plus session id.

Deliberate deviations from "real server over HTTP", each because the thing under test has no HTTP surface:

| Test | Why |
| --- | --- |
| `packages/hooks-server/test/e2e/opencode-plugin.test.ts`, `opencode-plugin-acts.test.ts` | The plugin runs inside OpenCode, which cannot start in the suite without a model login: a fake plugin context, against the real server. The continue counter is per plugin module, so tests use distinct session ids. |
| The `permission.evaluate` case in `contract-v1-event.test.ts` | OpenCode encodes nothing there, so only the decoded event shows its tool (in-process `decode`). |
| `packages/hooks/test/contract-v1-pipeline.test.ts` | Per-layer `timeoutMs` and `onFault`, and `handle()`'s fail-closed path, are library API that `HOOK_MIDDLEWARE` cannot express. |
| `packages/hooks/test/log-meta-keys.test.ts` | It checks every handler's `meta` against the log line's field names; over HTTP a clash would only show as an overwritten field. |

Encoding is tested only over the wire (`contract-v1-encode.test.ts`, one server per `v1-*` middleware module). The shim is a process by
design and is tested only as one. Tests that need it shorten `HOOK_SHUTDOWN_GRACE_MS` and other timers.

The library's own tests (`packages/hooks/test/`) run its shipped files under Node, because StateForge imports the library from Node and
ships the shim to Node-only places (its agent sandbox): the shim with `node`, and the built `dist/` imported by name (so Node's
`exports` resolution must pick `dist/`, not `src/`) with every fixture answering its snapshot. `tools/check-boundaries.ts` runs before `bun test` and fails when a package reaches
into another's files, imports an undeclared package, or (hooks, adapters) uses a Bun API in shipped code.

## Clients

**Shim** (`packages/hooks/clients/shim/hook-shim.ts`):
- It reads one payload on stdin, posts it to `/hook/<harness>` and prints the answer. Failure modes are ADR 0003, point 4.
- It waits for the stdout write to finish before exiting, because exiting straight after a write to a pipe can cut the answer short.
- Its failure messages (`HOOK_SHIM_DEBUG=1`) never contain a header, so they cannot carry the token.
- It uses no Bun API. Node 22.18+ runs the `.ts` from a checkout, but an installed copy runs `dist/clients/shim/hook-shim.js`, because
  Node does not strip types under `node_modules`; `shimPath` picks the right one. `paths.ts` itself runs from `src/` (Bun) and
  `dist/src/` (Node).

**OpenCode plugin** (`packages/hooks/clients/opencode/`):
- It posts every forwarded hook and lifecycle event, then acts on the answer as the matrix above says.
- It is bundled into one file at install time (see Code conventions).

**Installer** (`packages/hooks-server/scripts/install.ts`):
- Nothing changes without `--apply`.
- It never replaces a different existing file; it writes only when the file is absent and says what it did. The plugin bundle is the
  exception, because it is the installer's own file: it is updated, and an older `harness-hooks.ts` copy is removed so OpenCode does not
  load the plugin twice.
- Claude's settings are only printed, because they live in dotfiles.

## Unresolved (kept, with what would settle each)

| Unresolved | Settles it |
| --- | --- |
| Claude `WorktreeCreate` over HTTP: the passive `{}` lacks `worktreePath`, which per Claude's docs fails the creation (ADR 0003) | Leave it out of the installed hooks or answer a `worktreePath`; a capture |
| Claude `from_model` null on Pre/PostModelSwitch | A capture of a model switch with no previous model |
| Codex spawn: can a model be requested, under which key | Capture with a prompt that names a subagent model |
| Codex merge order with several hooks; whether `hookEventName` is mandatory in output (the late-hook timeout is settled: fails open, R-2026-11-07-10 F7) | A run with two hooks; a run that answers context without it |
| OpenCode has no context path in the plugin yet; `ctx.session.hook("context", ...)` can add system text before each model request but was never captured (the Codex path is settled: R-2026-11-07-10 F21) | A capture of the context hook, then the plugin |
| Codex `SubagentStop` block on a real run (encoded from the pinned schema); Claude Code contract v1 shapes on a real run (encoded from the docs) | A live Codex run with a subagent; a `claude -p` run against the server with a deny layer |
| OpenCode `permission.evaluate` effects (deny/ask); a reply field for it | Not needed while the pre-tool deny refuses the call |
| How StateForge consumes the packages (registry, ADR-0181 exception); the split itself is done (ADR 0002, phase 2) | R-2026-11-07-09 follow-ups; plan phase 7 |
| OpenCode root `session.created`, compaction hook and events, `deny`/`ask` effects, failed tool status | See R-2026-11-07-08, Open questions |
