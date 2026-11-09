# @stateforge-labs/harness-adapters

Harness knowledge that is not a hook, for Claude Code, Codex and OpenCode: transcript and store readers, in-flight and background
detection, CLI invocation, usage and context windows, tool facts, TUI screen chrome and a headless runtime that runs each harness's CLI.
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
| `@stateforge-labs/harness-adapters/runtime` | `createRuntime`, `Harness`, credentials, policy, results and failures | 0.x, stable within 0.x |
| `@stateforge-labs/harness-adapters/engine` | the CLI engine contract for building a harness driver | experimental |
| `@stateforge-labs/harness-adapters/testing` | `fakeRuntime`, `fakeProcessRunner`, `fakeFs`, `fakeClock` and the driver contract checks | 0.x, stable within 0.x |

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

export async function answer(question: string): Promise<string> {
  await using runtime = createRuntime();
  const claude = runtime.headless(Harness.Claude, {
    credential: { mode: "login-store", acknowledgePolicy: true },
  });
  const result = await claude.run({ instructions: "Answer in one short sentence.", input: question });
  if (!result.ok) {
    throw new Error(result.failure.message);
  }
  return result.value.text;
}
```

`run` returns a `Result`: `{ ok: true, value }` or `{ ok: false, failure }`. Branch on `failure.kind` (see Errors). `headless(...)` also
returns `plan(...)`, to see the invocation without running it, and `stream(...)`, which yields events as the run progresses.

## Tool and env policy

`ToolPolicy` controls what the harness may use during a run: `builtins` (`"off"`, `"none"` or `"harness-default"`), `mcp` (an allowlist
of endpoints, or `"harness-default"`), `settings` (which settings sources load), and `strict`. `TOOLS_OFF` turns every built-in and MCP
tool off; `TOOLS_DEFAULT` leaves the harness's defaults alone. A call's policy is merged with the consumer's policy by `resolveTools`.

Each axis is checked against the chosen engine's capability cells: an axis the engine cannot enforce fails with `unsupported`, and an
axis enforced only by emulation is listed as emulated in the plan. `strict` tightens this check; see the Differences per harness table.

`EnvPolicy` controls the child's environment. `{ kind: "inherit" }` (the default) starts from the caller's environment, with an optional
`transform` that filters or rewrites it. `{ kind: "closed", set, quiet }` starts from an empty environment and sets only `set`; `quiet`
suppresses the harness's own warnings about it. The runtime adds the variables a credential needs on top of either policy and records the
names in a `credential-plan` event.

## Differences per harness

The table is rendered from the capabilities each driver declares. A cell is the support state for the CLI engine: `supported`, `emulated`
(with how), `unsupported` (with the reason) or `unmeasured` (with the question still open). The SDK engine is not built in this release, so
its cells read `unsupported: not-implemented`.

<!-- cells:start -->
| Capability | Claude | Codex | OpenCode |
| --- | --- | --- | --- |
| `effort` | supported | supported | unmeasured: 2.2.6 documents provider/model#variant in --model; is there an effort flag? |
| `structured-output` | unsupported: not-implemented | unsupported: not-implemented | unmeasured: does OpenCode 2.2.6 run have a structured output flag? |
| `sessions-delete` | unsupported: not-implemented | unsupported: not-implemented | unsupported: not-implemented |
| `ephemeral` | supported | supported | unmeasured: does `session delete` reach a `--standalone` run's session? |
| `cost` | supported | unsupported: harness-limit | unmeasured: committed capture is an error stream; does the real 2.2.6 step_finish carry cost? |
| `settings-sources` | supported | supported | unmeasured: does any OpenCode flag or env skip user config for a headless run? |
| `builtin-tools-off` | supported | emulated: read-only sandbox, --ignore-user-config and --disable features; apply_patch and MCP resource tools remain | unmeasured: does a V2 permissions deny list hide every built-in tool, including skill and the opencode_* meta tools? |
| `mcp-none` | supported | emulated: --ignore-user-config drops configured MCP servers; MCP resource tools remain | unmeasured: does an empty config directory leave no MCP server configured for a headless run? |
| `mcp-allowlist` | unsupported: engine-limit | unsupported: engine-limit | unsupported: engine-limit |
| `closed-env` | supported | unmeasured: does a closed environment with only CODEX_HOME and PATH keep a headless run working? | unmeasured: does a closed environment keep an OpenCode headless run working? |
| `base-url` | supported | unmeasured: which config key or variable points a codex run at another base url? | unmeasured: which config key points an OpenCode run at another base url? |
| `resume` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `resume-checkpoint` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `per-turn-usage` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `unknown-tool-detection` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
| `session-store` | unsupported: not-implemented | unmeasured: has this harness been measured for the agent facet? | unmeasured: has this harness been measured for the agent facet? |
<!-- cells:end -->

## Errors

Every failure is a `RunFailure` with a `kind`, a `message` and kind-specific fields. Handle every kind; keep a default branch, because a
later release may add one.

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
| `unavailable` | the binary is missing, failed to spawn, is an unaccepted version, or the runtime is closed; check `reason` | CLI engine |
| `too-large` | an input (`instructions`, `input` or `environment`) is over its limit; shorten it and compare `limitBytes` with `actualBytes` | CLI engine |
| `output-too-large` | the output is over the stdout limit; ask for a shorter answer | CLI engine |
| `unsupported` | the chosen engine cannot enforce a capability the call requires (see `capability`, `why`); change the policy or the engine | CLI engine, runtime |
| `cancelled` | reserved for a cancellation that is not an abort; no producer in this release | none yet |
| `max-turns` | reserved for a turn limit; no producer in this release | none yet |
| `no-output` | reserved for a run that finished without output; no producer in this release | none yet |
| `store-failed` | reserved for a session store failure; no producer in this release | none yet |
| `session-not-found` | reserved for a resume of an unknown session; no producer in this release | none yet |

The CLI engine emits the first sixteen kinds. The last five are part of the type so that a later release can add a producer without a
breaking change; a consumer should handle them now.

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
- **Experimental**: the `engine` subpath. Its types may change in a minor release.
- **Internal**: anything not exported from a subpath. The package ships only `dist/`.

Until 1.0 a minor release may change a type in a breaking way; the CHANGELOG marks every such change.

## Residue

These facts were measured on 2026-11-09 against the harness versions named. Each one is a reason the driver does what it does; a new harness
version may change them.

- **OpenCode v2.2.6**: `opencode run` has no `--pure` flag and no flags for tools or base URL. Without `--standalone` it uses a shared
  background service that ignores per-call environment, so `--standalone` is required. Setting `OPENCODE_CONFIG_DIR` to an empty directory
  replaces the global config directory; it works together with `OPENCODE_DISABLE_PROJECT_CONFIG` and `OPENCODE_DISABLE_CLAUDE_CODE`, and
  setting the config directory alone does not isolate the run. The V2 permission deny rules hide `read`, `edit`, `glob`, `grep`, `shell`,
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
