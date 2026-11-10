# The agent facet

`runtime.agent(id, options)` returns a `Result<Agent, RunFailure>`. An `Agent` starts runs with `start(start)`; a run yields a stream of
events and one settled result. An agent run goes through the vendor SDK engine of the harness. The CLI engine is never used for an agent run:
an options object that asks for it (`engine: "cli"`, which the type does not allow) returns `unsupported` with `why: "agent-runs-use-the-sdk-engine"` before anything starts.

This release has one SDK engine: Claude, through `@anthropic-ai/claude-agent-sdk`, pinned exactly at 0.3.316. The package loads it with a
dynamic import inside the first `start`, so importing the package, or using the one-shot `headless` facet, never loads it. For any other
harness `runtime.agent` returns `unsupported` unless the consumer injects an engine with `createRuntime({ agentEngines })`.

Runnable examples: [`examples/agent/`](../examples/agent). The shape of every type is in the declarations that the `runtime` subpath ships.

## Options

`AgentOptions` is checked once, in `runtime.agent`. A bad field fails there, with `invalid-config` and the name of the field, before any run.

| Field | Meaning |
| --- | --- |
| `credential` | `{ mode: "api-key", key, baseUrl }`. One injected key (a `secret(...)`) and a mandatory base URL. A missing base URL is `invalid-config` on `credential.baseUrl` |
| `dirs` | `{ cwd, home, configDir, tmpDir }`. Absolute paths that exist and are writable. The library creates none of them and removes none of them |
| `tools` | a `ToolPolicy`. `mcp` must be a list of endpoints (`[]` for none); `"harness-default"` is refused because the child must not discover servers on its own |
| `env` | `{ kind: "closed", set, quiet? }`. The child environment is built only from `set`, the credential, the bearer slots below, `HOME` (`dirs.home`) and `TMPDIR` (`dirs.tmpDir`). Nothing is read from the ambient environment |
| `binary` | `{ path, runtime }`, or `null` fields to detect the launcher once. Optional |
| `timeoutMs`, `idleTimeoutMs` | positive integers. The first limits the whole run; the second limits the time between events. Either ends the run with `timeout` |
| `signal` | an `AbortSignal`. Aborting it ends the run with `aborted` |

The Claude child runs with no settings sources (user, project and local settings and `CLAUDE.md` are not loaded), `tools: []` when the
policy turns built-in tools off, and strict MCP config, so only the endpoints in `tools.mcp` exist.

## Starting a run

`agent.start(start)` returns an `AgentRun` at once; it never throws and never returns a promise.

| `AgentStart` field | Meaning |
| --- | --- |
| `instructions`, `prompt` | the system prompt and the user prompt |
| `maxTurns` | required positive integer. There is no library default |
| `model`, `effort` | optional |
| `outputSchema` | a JSON schema object. The structured result arrives as an `output` event and in `AgentOutput.output` |
| `resume` | `{ sessionId, checkpoint?, recoveryPrompt? }`. See Resume |
| `hooks` | `{ pipeline, socket }`. See Hooks |
| `store` | a `TranscriptStore` the run mirrors its transcript to. See Store |

A run yields `AgentEvent` values: `started`, `session` (id and checkpoint), `turn`, `text`, `usage`, `tool`, `refused`, `output`,
`recovered`, `unrecognised`, and last `finished`. Exactly one `finished` event is emitted and it is the last event. `run.settled` is a
promise that never rejects; it resolves to the same `Result<AgentOutput, RunFailure>` the `finished` event carries, after that event is
emitted.

```ts
for await (const event of run.events) {
  if (event.kind === "refused") console.error(event.tool, event.reason);
}
const result = await run.settled;
```

## Usage

A `usage` event is the raw token count of one model message: `turn`, `model`, `input`, `cacheWrite`, `cacheRead`, `output`.
`AgentOutput.usage` lists them. The library computes no cost for an agent run; prices are the consumer's. `AgentOutput.turns` is the
vendor's turn count and can differ from the number of usage entries.

A usage event is emitted when the next message starts, or at the end of the run, so it can arrive after the text of its own message.

## Cancel

`run.cancel()` aborts the run and returns a promise that settles only after the run has ended: the `finished` event is emitted (with a
`cancelled` failure) and the engine has finished its wait on the child process tree. The promise never rejects, and a second call resolves
too. A cancel after the run finished changes nothing.

What is guaranteed, on the Claude engine, measured on the runtime clock the runtime was created with:

- `cancel()` always resolves. After the abort the engine waits at most 2.5 s for the SDK stream to end. If it has not ended, the engine
  sends `SIGKILL` to the child's process group and stops reading the stream.
- Closing the stream is given at most 6 s. Then the engine polls the process group for at most 6 s, sending `SIGKILL` once if the group is
  still alive 2.5 s into the poll. In the worst case `cancel()` resolves about 14.5 s after the abort.
- The `finished` event carries `tree`. `"gone"` means the process group had no live process when the engine stopped polling. `"unconfirmed"`
  means the engine gave up first, or the platform has no process groups (Windows): the run settled, but a process of the tree may remain.
  `tree` is on the `finished` event of every run, not only a cancelled one.
- Not guaranteed: a descendant that left the process group (for example by starting a new session) is not seen, and `"gone"` says nothing
  about it.

In the measured runs the stream ended about 2.0 s after `abort()` with every descendant gone by 2.4 s. A consumer that needs a shorter
deadline races `cancel()` against a timer.

## Hooks

Hooks are the consumer's: it passes a [`harness-hooks`](https://github.com/stateforge-labs/harness-kit/blob/main/packages/hooks/README.md) `Pipeline` in `start.hooks.pipeline`.

- Under the Claude SDK the engine registers SDK hook callbacks that call `handle(adapter, payload, pipeline)` in the same process and return
  the encoded body. The library builds no layer and opens no port. A deny from the pipeline also becomes a `refused` event with
  `source: "hook"` and the bare tool name.
- `start.hooks.socket` (`{ path, shimDir }`, or `null`) names the Unix socket of an endpoint the consumer runs, for an engine of a harness whose
  hooks are commands. The Claude engine uses the in-process callbacks and ignores it. The library never opens a port or a socket.
- The SDK never fires `SessionStart`. Context a pipeline would give at session start is delivered with the first `UserPromptSubmit`.

`agent.hooks` is a table, per hook point (`pre-tool`, `post-tool`, `stop`, `session-start`, `prompt-submit`), of the support state for the
harness under its SDK: `supported`, `emulated` (with how) or `unmeasured`. For Claude, `session-start` is `emulated`. For every harness
other than Claude it is `unmeasured` at every point.

## The bearer rule

An MCP endpoint takes a bearer as a `secret(...)`:

```ts
tools: { builtins: "off", mcp: [{ name: "docs", url, bearer: secret(token), allow: ["search"] }], settings: "none" }
```

The library never writes the token into the SDK options. It puts it in the child environment as `AGENT_MCP_BEARER_<index>` and writes the
header value as `Bearer ${AGENT_MCP_BEARER_<index>}`, which the child expands itself. A literal token in the header would be part of the
child's argument list: that was measured in 113 of 120 samples of the child's command line, and with the reference form it was in none.
The token stays readable to the same user from the child's environment.

An endpoint with `allow: [...]` only exposes those tools; the others are denied by permission without a hook. That denial produces no
`refused` event. The allow list is enforced only with `builtins: "off"`: an endpoint with a non-empty `allow` combined with any other `builtins`
value is refused by `runtime.agent(...)` as `invalid-config` on `tools.builtins`, before anything starts.

## Resume and recovery

`resume: { sessionId, checkpoint? }` continues a session; with a `checkpoint` (the value of an earlier `session` event) the run resumes at
that message. A session that is gone ends with `session-not-found`. When `recoveryPrompt` is set, the facet instead emits one `recovered`
event and runs once more as a fresh session with that prompt, and it does so at most once. A resume miss before any model message costs no
model call.

## Store

`start.store` is a `TranscriptStore`: `append(key, entries)`, `load(key)` and `listSubkeys(key)`. The key is `<project>/<session>`. The run
mirrors its transcript through `append`, and a resume loads the session from `load`, so a session can resume where the local transcript file
does not exist. A rejection of `append` ends the run with `store-failed`, after the SDK has retried (measured: about 2.2 s). With a store,
the run keeps a transcript; without one, an agent run leaves no transcript file in the config directory.

## Failures

| Kind | When |
| --- | --- |
| `invalid-config` | a field of the options or the start is bad, or the bearer has no value in the child environment |
| `unsupported` | the CLI engine was asked for, or the harness cannot do a required cell; read `capability` and `why` |
| `credential`, `credential-unsupported` | the credential is missing a field or is not an `api-key` |
| `cancelled` | `run.cancel()` was called |
| `aborted` | `options.signal` or the runtime's shutdown aborted the run |
| `timeout` | `timeoutMs` or `idleTimeoutMs` passed |
| `max-turns` | the run reached `maxTurns` without ending |
| `no-output` | the run ended without a result, or without the structured output that was asked for |
| `store-failed` | the store rejected an append |
| `session-not-found` | the resumed session does not exist and no `recoveryPrompt` was given |
| `auth-rejected`, `exit`, `unparsable`, `unavailable` | the engine or the child failed; `stderrTail` is redacted |

No secret (the key, a bearer, a `secret(...)` value in `env.set`) reaches an event or a failure: they are redacted
before they leave the run.

## Testing without a model

`@stateforge-labs/harness-adapters/testing` has what a consumer needs to test its whole agent path with no model and no binary:

- `fakeAgentEngine(harness, scripts)` replays scripted events and results and records every input it was given. A script can delay each event
  (`delayMs`) and hold the end of a cancelled run open (`settleDelayMs`).
- `fakeClaudeQuery(messages, behaviour)` with `claudeMessages` feeds the real Claude engine scripted SDK messages, so the hook callbacks, the
  bearer slots and the event decoding run for real.
- `fakeTranscriptStore()` is an in-memory store; `scriptedMessagesApi()` is a local Messages API for runs that go through a real child.
- `agentContract(subject)` runs the checks every agent engine must pass against a runtime of the consumer's wiring: one terminal event and it
  is last; `settled` never rejects and equals the terminal result; a cancel resolves only after the terminal event and ends as `cancelled`;
  `maxTurns` is required; a CLI agent run is refused before anything starts; no secret reaches an event, even when the engine echoes it; the child environment is closed;
  a deny becomes a `refused` event; usage is raw per message and carries no price; session events carry id and checkpoint; a resume miss
  recovers only with a recovery prompt.

  The cancel check runs `cancel()` and looks for the terminal event the moment it resolves, with no wait. The `cancel` scenario of the
  subject must therefore wire an engine whose end takes time after the abort (with `fakeAgentEngine`, a script with `settleDelayMs`), so that a
  `cancel()` that resolves before the terminal event is caught.

  The secret check is not passive. The subject's `echo` scenario wires an engine that repeats every value the suite hands it, once in a
  `text` event and once as the target of a `tool` event, and the check fails unless the library's `[redacted]` marker replaced the values in
  both and no value appears anywhere in the run. A facet whose redaction is removed fails it. A subject without an `echo` scenario fails the
  check and says so.

## Capability cells and what was measured

`agent.capabilities` is the SDK column of the capability table for the agent cells. The README renders the table for every built-in harness.
A cell is `supported` only where a dated measurement exists. This is the record for Claude, measured on 2026-11-09 with
`@anthropic-ai/claude-agent-sdk` 0.3.316 driving Claude Code 2.1.319, on Node 24.22 and Bun 1.4.4, with a closed environment, no settings
sources, `tools: []` and strict MCP:

| Cell | Date | Measured by |
| --- | --- | --- |
| `builtin-tools-off` | 2026-11-09 | the init tool list was empty in five live runs |
| `mcp-none`, `mcp-allowlist` | 2026-11-09 | a live run with built-in tools off saw only the allowed endpoint's tools; an `allow` list denied another tool with no hook and the server received no call. `mcp-allowlist` is supported only with built-in tools off; the combination with built-in tools on is refused |
| `closed-env` | 2026-11-09 | the child's environment names were read from the process; a variable set only in the parent was absent |
| `settings-sources` | 2026-11-09 | with a user hook, a project hook and a project `CLAUDE.md` present, none ran and none was sent; with the sources enabled all ran |
| `base-url` | 2026-11-09 | requests reached a local listener at the injected base URL with the key in the vendor header |
| `resume`, `resume-checkpoint` | 2026-11-09 | a live run resumed from the store alone, with the local transcript removed, kept the session id and answered from the earlier turns |
| `per-turn-usage` | 2026-11-09 | live runs gave one usage event per model message, with cache reads growing across messages |
| `structured-output` | 2026-11-09 | a live run with an output schema produced an `output` event with the requested JSON |
| `unknown-tool-detection` | 2026-11-09 | a scripted model answer that called a tool absent from the init list produced one `refused` event with `source: "unknown-tool"` on both runtimes |
| `session-store` | 2026-11-09 | a live run mirrored 18 entries for one key; a failing store ended the run with `store-failed` |
| `ephemeral` | 2026-11-09 | runs with no store left no transcript file |
| `pre-tool`, `post-tool`, `prompt-submit`, `stop` | 2026-11-09 | the callbacks ran through a live `Pipeline`: a deny never reached the tool server and the model saw the reason. `session-start` never fired in four runs and is `emulated` |
| cancel | 2026-11-09 | a cancel 3.5 s into a slow scripted stream settled in 2.05 to 2.06 s on both runtimes, with the descendant gone |

Not established, and therefore not claimed anywhere in the tables:

- whether the init tool list names `StructuredOutput` (the engine exempts that name from unknown-tool detection);
- a cancel in the middle of a real model answer (the live cancel came after the whole answer had arrived; the representative cancel used a
  scripted stream);
- a cancel with a grandchild that outlives the leader, on a real SDK run (covered by a test with real processes);
- the platform binary bundled with the SDK package, Windows and macOS (the reap uses a POSIX process group);
- hook points other than the four above, and every hook point of a harness other than Claude (`unmeasured`);
- Codex and OpenCode under their SDKs.
