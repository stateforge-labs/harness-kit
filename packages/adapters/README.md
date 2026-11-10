# @stateforge-labs/harness-adapters

Harness knowledge that is not a hook, for Claude Code, Codex and OpenCode: transcript and store readers, in-flight and background
detection, CLI invocation, usage and context windows, tool facts, TUI screen chrome, a headless runtime that runs each harness's CLI and an
agent facet that runs a harness through its vendor SDK.
One module per harness. It is built on
[`@stateforge-labs/harness-hooks`](https://github.com/stateforge-labs/harness-kit/blob/main/packages/hooks/README.md), which holds the hook
events, the closed value sets and the schemas.

## Install

```sh
bun add @stateforge-labs/harness-adapters
npm install @stateforge-labs/harness-adapters
```

Node 22.13 or later, or Bun. The package uses no Bun API in its shipped code.

## Usage

```ts
import { adapterEnv } from "@stateforge-labs/harness-adapters";

const env = adapterEnv();
console.log(env.codexHome);
```

`adapterEnv(source?)` reads `HOME`, `XDG_DATA_HOME` and `CODEX_HOME` from `source` (default `process.env`). An unset or empty variable
takes its default: `HOME` falls back to the home directory, `XDG_DATA_HOME` to `$HOME/.local/share`, `CODEX_HOME` to `$HOME/.codex`.
Pass an explicit object to test a module without touching the real environment.

## Subpaths

| Import | What | Tier |
| --- | --- | --- |
| `@stateforge-labs/harness-adapters` | `adapterEnv`, `EnvVar`, `AdapterEnv`, `EnvSource` | 0.x, stable within 0.x |
| `@stateforge-labs/harness-adapters/claude` | the Claude Code module | 0.x, stable within 0.x |
| `@stateforge-labs/harness-adapters/codex` | the Codex module | 0.x, stable within 0.x |
| `@stateforge-labs/harness-adapters/opencode` | the OpenCode module | 0.x, stable within 0.x |
| `@stateforge-labs/harness-adapters/opencode/store` | the OpenCode store reader. It imports `node:sqlite`, which prints an `ExperimentalWarning` on Node 22 (checked on 22.23); the other subpaths never load it | 0.x, stable within 0.x |
| `@stateforge-labs/harness-adapters/tui` | the TUI screen chrome | 0.x, stable within 0.x |
| `@stateforge-labs/harness-adapters/runtime` | `createRuntime`, `Harness`, credentials, policy, results, failures and the agent types | 0.x, stable within 0.x |
| `@stateforge-labs/harness-adapters/engine` | the CLI engine contract for building a harness driver | experimental |
| `@stateforge-labs/harness-adapters/testing` | `fakeRuntime`, `fakeProcessRunner`, `fakeFs`, `fakeClock`, the driver contract checks, and for the agent facet `fakeAgentEngine`, `fakeClaudeQuery`, `claudeMessages`, `fakeTranscriptStore`, `scriptedMessagesApi` and `agentContract` | 0.x, stable within 0.x |

## Credentials and policy

A headless run names its credential. The runtime never reads a credential from the environment on its own.

| Mode | Harness | What it means |
| --- | --- | --- |
| `api-key` | Claude, Codex, OpenCode | a `secret(...)` value is injected for the run. Claude also takes a `baseUrl` |
| `login-store` | Claude, Codex, OpenCode | the harness reuses its own sign-in. Claude's login store needs `acknowledgePolicy: true` |
| `token` | Claude | a bearer token, with `acknowledgePolicy: true` |
| `cloud` | Claude | the harness's cloud provider settings |

`runtime.policyNotice(harness, mode)` returns the notice a consumer shows before the mode is used. A run whose mode needs
acknowledgement and is not acknowledged fails with `policy-not-acknowledged` before anything is spawned. `createRuntime({ allowedModes })`
refuses every mode not in the list with `credential-unsupported`. `runtime.credentialFrom(harness, spec)` builds and checks a credential
and reports a `credential` failure for a missing or empty field. `secret(value)` wraps a credential value so that it is not handled as plain text.

## Quick start

```ts
import { createRuntime, Harness } from "@stateforge-labs/harness-adapters/runtime";

const QUESTION = "What is a monad, in one sentence?";

async function main(): Promise<number> {
  await using runtime = createRuntime();
  const claude = runtime.headless(Harness.Claude, {
    credential: { mode: "login-store", acknowledgePolicy: true },
  });
  const result = await claude.run({ instructions: "Answer in one short sentence.", input: QUESTION });
  if (!result.ok) {
    console.error(`${result.failure.kind}: ${result.failure.message}`);
    return 1;
  }
  console.log(result.value.text);
  return 0;
}

process.exitCode = await main();
```

`run` returns a `Result`: `{ ok: true, value }` or `{ ok: false, failure }`. Branch on `failure.kind` (see Errors). `headless(...)` also
returns `plan(...)`, to see the invocation without running it, and `stream(...)`, which yields events as the run progresses.

## Agent runs

`runtime.agent(id, options)` returns an `Agent` whose `start(...)` runs the harness through its vendor SDK and returns a run: a stream of
events and a `settled` result that never rejects. This release has the Claude Agent SDK engine (`@anthropic-ai/claude-agent-sdk`, pinned
exactly at 0.3.316, loaded by a dynamic import at the first run, so importing the package never loads it). A CLI agent run is refused as
`unsupported` before anything starts.

```ts
import { createRuntime, Harness, secret, TOOLS_OFF } from "@stateforge-labs/harness-adapters/runtime";

await using runtime = createRuntime();
const made = runtime.agent(Harness.Claude, {
  credential: { mode: "api-key", key: secret(apiKey), baseUrl: "https://api.anthropic.com" },
  dirs: { cwd, home, configDir, tmpDir },
  tools: TOOLS_OFF,
  env: { kind: "closed", set: { PATH: "/usr/bin" } },
});
if (made.ok) {
  const run = made.value.start({ instructions: "Answer in one sentence.", prompt: "What is a monad?", maxTurns: 3 });
  for await (const event of run.events) {
    if (event.kind === "text") process.stdout.write(event.text);
  }
  const result = await run.settled;
}
```

- **Credential and environment.** One injected key and a mandatory base URL. The child environment is closed and built only from what the
  caller passes. The caller supplies the working, home, config and tmp directories, which must exist; the library creates none of them. Nothing
  is read from the ambient environment or from user settings.
- **Hooks.** The caller passes a `harness-hooks` `Pipeline` in `start.hooks`. For Claude the engine calls it in process through SDK hook
  callbacks; a deny also becomes a `refused` event. The SDK never fires `SessionStart`, so session context arrives with the first prompt.
- **MCP with a bearer.** Pass the token as the endpoint's `bearer`. The library writes the header as `Bearer ${VAR}` and gives the value only
  to the child environment, because a literal token lands in the child's argument list.
- **Store and resume.** `start.store` mirrors the transcript to a store the caller owns; `start.resume` continues a session from the store alone
  and, with a `recoveryPrompt`, falls back to one fresh run when the session is gone.
- **Limits.** `maxTurns` is required. `timeoutMs`, `idleTimeoutMs` and `signal` end a run.
- **Cancel.** `run.cancel()` resolves only after the terminal `finished` event is emitted and the child process tree is gone (about 2 s on
  Claude). Exactly one `finished` event is emitted and it is last.
- **Usage.** Raw token counts per model message. No cost is computed for an agent run.

The full reference, with what was measured for each capability cell, is in
[docs/agent.md](https://github.com/stateforge-labs/harness-kit/blob/main/packages/adapters/docs/agent.md); runnable examples are in
[examples/agent](https://github.com/stateforge-labs/harness-kit/tree/main/packages/adapters/examples/agent).

## Tool and env policy

`ToolPolicy` controls what the harness may use during a run: `builtins` (`"off"` or `"harness-default"`), `mcp` (an allowlist
of endpoints, or `"harness-default"`), `settings` (`"none"` or `"harness-default"`: which settings sources load), and `strict`. `TOOLS_OFF` turns every built-in and MCP
tool off; `TOOLS_DEFAULT` leaves the harness's defaults alone. A call's policy is merged with the consumer's policy by `resolveTools`.

Each axis is checked against the chosen engine's capability cells: an axis the engine cannot enforce fails with `unsupported`, and an
axis enforced only by emulation is listed as emulated in the plan. `strict` tightens this check; see the Differences per harness table.

`EnvPolicy` controls the child's environment. `{ kind: "inherit" }` (the default) starts from the caller's environment, with an optional
`transform` that filters or rewrites it. `{ kind: "closed", set, quiet }` starts from an empty environment and sets only `set`; `quiet`
suppresses the harness's own warnings about it. The runtime adds the variables a credential needs on top of either policy and records the
names in a `credential-plan` event.

## Differences per harness

The tables are rendered from the capabilities each driver declares. A cell is the support state: `supported`, `emulated` (with how),
`unsupported` (with the reason) or `unmeasured` (with the question still open). Each capability has one cell per engine. The first table is the CLI
engine; on it, a cell for an agent-only capability reads `unsupported: not-implemented`. The second table is the SDK engine, the one an agent run uses.
A Claude SDK cell is `supported` only where a dated measurement exists; [docs/agent.md](https://github.com/stateforge-labs/harness-kit/blob/main/packages/adapters/docs/agent.md#capability-cells-and-what-was-measured)
lists the measurements (2026-11-09) and what was not established.

CLI engine:

<!-- cells:start -->
| Capability | Claude | Codex | OpenCode |
| --- | --- | --- | --- |
| `effort` | supported | supported | unmeasured: 2.2.6 documents provider/model#variant in --model; is there an effort flag? |
| `structured-output` | unsupported: not-implemented | unsupported: not-implemented | unmeasured: does OpenCode 2.2.6 run have a structured output flag? |
| `sessions-delete` | unsupported: not-implemented | unsupported: not-implemented | unsupported: not-implemented |
| `ephemeral` | supported | supported | emulated: every run leaves a session; session delete --standalone removes it in about 0.24 s after the run (opencode v2.2.6, 2026-11-09) |
| `cost` | supported | unsupported: harness-limit | supported |
| `settings-sources` | supported | supported | emulated: an empty OPENCODE_CONFIG_DIR replaces the global config directory and OPENCODE_DISABLE_PROJECT_CONFIG and OPENCODE_DISABLE_CLAUDE_CODE are set; an AGENTS.md marker in the global config was not obeyed, global plugins untested, auth stays in the data directory (opencode v2.2.6, 2026-11-09) |
| `builtin-tools-off` | supported | emulated: read-only sandbox, --ignore-user-config and --disable features; apply_patch and MCP resource tools remain | emulated: permissions deny rules in OPENCODE_CONFIG_CONTENT hide read, edit, glob, grep, shell, subagent, webfetch, websearch, execute and question; the model still lists skill, experimental_image_generate, opencode_models, opencode_session_move, opencode_session_rename, opencode_worktree_create, opencode_worktree_list (opencode v2.2.6, 2026-11-09); whether those leftovers can run is untested |
| `mcp-none` | supported | emulated: --ignore-user-config drops configured MCP servers; MCP resource tools remain | unmeasured: does a deny on the MCP resource tools plus an empty config directory leave no MCP server tool callable in a headless run? |
| `mcp-allowlist` | unsupported: engine-limit | unsupported: engine-limit | unsupported: engine-limit |
| `closed-env` | supported | unmeasured: does a closed environment with only CODEX_HOME and PATH keep a headless run working? | unmeasured: does a closed environment keep an OpenCode headless run working? |
| `base-url` | supported | unmeasured: which config key or variable points a codex run at another base url? | unmeasured: which config key points an OpenCode run at another base url? |
| `resume` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `resume-checkpoint` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `per-turn-usage` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `unknown-tool-detection` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `session-store` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
<!-- cells:end -->

SDK engine:

<!-- sdk-cells:start -->
| Capability | Claude | Codex | OpenCode |
| --- | --- | --- | --- |
| `effort` | unsupported: not-implemented | unsupported: not-implemented | unsupported: not-implemented |
| `structured-output` | supported | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `sessions-delete` | unsupported: not-implemented | unsupported: not-implemented | unsupported: not-implemented |
| `ephemeral` | supported | unsupported: harness-limit | unmeasured: has this harness been measured for the agent facet? |
| `cost` | unsupported: not-implemented | unsupported: not-implemented | unsupported: not-implemented |
| `settings-sources` | supported | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? |
| `builtin-tools-off` | supported | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? |
| `mcp-none` | supported | unsupported: not-implemented | unsupported: not-implemented |
| `mcp-allowlist` | supported | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? |
| `closed-env` | supported | unmeasured: does a closed environment keep a Codex SDK run working? | unmeasured: has this harness been measured for the agent facet? |
| `base-url` | supported | unsupported: not-implemented | unsupported: not-implemented |
| `resume` | supported | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `resume-checkpoint` | supported | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `per-turn-usage` | supported | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? |
| `unknown-tool-detection` | supported | unmeasured: one exec tool nests the other tools; can an unknown tool be told apart? | unmeasured: has this harness been measured for the agent facet? |
| `session-store` | supported | unsupported: harness-limit | unsupported: harness-limit |
<!-- sdk-cells:end -->

## Errors

Every failure is a `RunFailure` with a `kind`, a `message` and kind-specific fields. Handle every kind and keep a default branch for any kind you do
not recognise.

| Kind | Meaning and consumer action | Emitted by |
| --- | --- | --- |
| `invalid-config` | a field of the runtime or run configuration is malformed; fix the call site and do not retry | CLI engine, runtime |
| `unknown-harness` | the harness id is not registered with the runtime; check the id against `Harness` | runtime |
| `credential` | a credential field is missing, empty or not a secret; supply it and do not retry unchanged | CLI engine, runtime |
| `credential-unsupported` | the mode is unknown, not offered by the harness, or not in `allowedModes`; pick another mode | CLI engine, runtime |
| `policy-not-acknowledged` | the mode needs acknowledgement; show `notice` to the person, then retry with `acknowledgePolicy: true` | CLI engine |
| `credential-mismatch` | the login the harness reports differs from the one requested; sign in as the requested account | CLI engine |
| `auth-rejected` | the harness rejected the credential; ask for a new one, do not loop | CLI engine |
| `timeout` | the run passed `timeoutMs`; retry with a larger budget or a smaller task | CLI engine |
| `aborted` | the caller's signal aborted the run; treat as a cancellation from the caller | CLI engine |
| `exit` | the harness exited with a non-zero code or signal; read `stderrTail` for the reason | CLI engine |
| `unparsable` | the harness output could not be read; report the version and `reason` | CLI engine |
| `unavailable` | the binary is missing, failed to spawn, the scratch directory could not be made, the runtime is closed, or an internal error occurred; check `reason` | CLI engine |
| `too-large` | an input (`instructions`, `input` or `environment`) is over its limit; shorten it and compare `limitBytes` with `actualBytes` | CLI engine |
| `output-too-large` | the output is over the stdout limit; ask for a shorter answer | CLI engine |
| `unsupported` | the chosen engine cannot enforce a capability the call requires (see `capability`, `why`); change the policy or the engine | CLI engine, runtime |
| `cancelled` | the caller called `cancel()` on an agent run; not a failure to retry | agent facet |
| `max-turns` | an agent run reached `maxTurns` without ending; raise the limit or narrow the task | agent facet |
| `no-output` | an agent run ended without a result, or without the structured output that was asked for | agent facet |
| `store-failed` | the transcript store rejected an append; `reason` is the store's redacted message | agent facet |
| `session-not-found` | the session to resume does not exist and no `recoveryPrompt` was given | agent facet |

The CLI engine emits the first sixteen kinds. The last five are emitted by the agent facet; a consumer of the CLI engine should still handle
them. The agent facet also emits `invalid-config`, `unsupported`, `credential`, `timeout`, `aborted` and `unavailable`; see
[docs/agent.md](https://github.com/stateforge-labs/harness-kit/blob/main/packages/adapters/docs/agent.md#failures).

## Lifecycle

`createRuntime(config?)` returns a `Runtime` that is an `AsyncDisposable`, so `await using runtime = createRuntime()` closes it at the end
of the block. `close()` waits for runs in flight, then removes the scratch directories the runtime made, except those kept for a run that
asked to keep them. After `close()`, a call fails with `unavailable: runtime-closed`.

Each run gets a private working directory named with the prefix `stateforge-adapters-cwd-` under the temporary root (`TMPDIR`, falling back
to the system default). `runtime.sweep({ olderThanMs })` removes directories with that prefix, and the older scratch prefixes, that are
older than the given age.

## Stability tiers

- **Stable within 0.x**: the root, `claude`, `codex`, `opencode`, `opencode/store`, `tui`, `runtime` and `testing` subpaths. A minor release may
  add exports and failure kinds; a consumer's `switch` on `kind` keeps a default branch for that reason.
- **Experimental**: the `engine` subpath, and the driver-authoring and port types that `runtime` re-exports (`Drivers`, `HarnessDriver`, `CredentialFacet`,
  `RunFacet`, `Clock`, `ProcessRunner`, `ProcessSpec`, `RunningProcess`, `RuntimeFs`, `ProbeIo`, `Availability`, `Profile`). Their shapes may change in a minor release.
- **Internal**: anything not exported from a subpath. The package ships only `dist/`.

Until 1.0 a minor release may change a type in a breaking way; the CHANGELOG marks every such change.

## Residue

These facts were measured on 2026-11-09 against the harness versions named. Each one is a reason the driver does what it does; a new harness
version may change them.

- **OpenCode v2.2.6**: `opencode run` has no `--pure` flag and no flags for tools or base URL. Without `--standalone` it uses a shared
  background service that ignores per-call environment, so `--standalone` is required. Setting `OPENCODE_CONFIG_DIR` to an empty directory
  replaces the global config directory. The run was measured with `OPENCODE_CONFIG_DIR`, `OPENCODE_DISABLE_PROJECT_CONFIG` and
  `OPENCODE_DISABLE_CLAUDE_CODE` set together; which of the three alone is enough to isolate it was not isolated. The V2 permission deny rules hide `read`, `edit`, `glob`, `grep`, `shell`,
  `webfetch`, `websearch`, `execute`, `question` and `subagent`, but `skill`, `experimental_image_generate` and the `opencode_*` meta tools
  remain. Tools-off on OpenCode is therefore emulated, with those leftovers named, and the leftovers are unmeasured.
- **OpenCode sessions**: each run leaves a session. `opencode session delete --standalone <id>` removes it in about 0.24 s. Auth lives in the
  data directory, so a run must keep that directory reachable.
- **Codex**: `CODEX_HOME` set through the environment isolates configuration and hooks from the user's home directory. `apply_patch` cannot be
  removed, so tools-off on Codex is emulated under a read-only sandbox.

## Observability

`createRuntime({ onEvent })` receives a `LibraryEvent` for each step:

- `spawn` and `exit`: the harness, the engine, the purpose of the process, its argument count, and for `exit` the code, the signal, the
  duration and the outcome. Arguments are counted, not printed.
- `credential-plan`: the mode and the names of the variables injected and stripped.
- `engine-selected`: the engine a run uses.
- `cwd-created` and `cwd-removed`: the private working directory and whether it was kept.

Events are for logging and metrics.

## Orphans

Each harness process starts detached, in its own process group, and a timeout or an abort signals that group, so the harness's child
processes are signalled with it. `close()` waits for runs in flight before it removes any directory, so a directory is not removed under a
running harness.

## TUI screen chrome

`@stateforge-labs/harness-adapters/tui` lists the lines each harness's interactive screen draws around the conversation: borders, the
prompt, key hints, spinners and status footers. A screen reader strips them before it reads the text. Each harness has its own list,
so a Claude footer is not treated as chrome for Codex or OpenCode.

| Export | What |
| --- | --- |
| `CLAUDE_TUI_CHROME`, `CODEX_TUI_CHROME`, `OPENCODE_TUI_CHROME` | `{ boxOnly, lines }`: one border class and a list of line patterns per harness |
| `tuiChrome(harness)` | the record for one harness |
| `isChromeLine(harness, line)` | `true` when the line is a border row, blank, or matches one of the harness's patterns |
| `TuiChrome` | the record type |

```ts
import { isChromeLine } from "@stateforge-labs/harness-adapters/tui";
import { Harness } from "@stateforge-labs/harness-hooks";

isChromeLine(Harness.Claude, "  ⏵⏵ auto mode on (shift+tab to cycle)"); // true
isChromeLine(Harness.Codex, "  ⏵⏵ auto mode on (shift+tab to cycle)"); // false
```

The patterns carry no `g` or `y` flag, so `test()` is stateless. The Claude list is a consumer's screen reader list, with the empty prompt widened to accept a no-break space after the chevron (the captured idle screen has one). The Codex
and OpenCode lists were built from their idle screens (`fixtures/codex/screens/idle.txt`, `fixtures/opencode/screens/idle.txt`).

Anything not listed is internal. The package ships only `dist/`; the fixtures stay in the repository.

## License

MIT. See [LICENSE](LICENSE).
