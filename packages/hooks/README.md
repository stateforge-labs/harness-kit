# @stateforge-labs/harness-hooks

Turns a hook payload from Claude Code, Codex or OpenCode into a neutral event, runs it through a middleware pipeline, and turns the
neutral reply back into that harness's own response. The `./endpoint` subpath serves a pipeline over HTTP, on a TCP port or a unix
socket. Nothing else in the shipped code needs Bun, so the same built `dist/` runs under Node and under Bun; the library writes no log.

## Requirements

- Node 22 or later, or Bun 1.4.4. Both run the built package in `dist/`; the package ships no TypeScript sources.
- Depends on [zod](https://zod.dev) 4 (`zod` 4.6.7 is pinned in `package.json`); npm and Bun install it with the package.

## Install

```sh
npm install @stateforge-labs/harness-hooks
```

With Bun:

```sh
bun add @stateforge-labs/harness-hooks
```

## Usage

```ts
import { adapters, defaultPipeline, handle } from "@stateforge-labs/harness-hooks";

const payload = {
  session_id: "fx-PreToolUse-2",
  transcript_path: "/home/user/.claude/projects/p/fx-PreToolUse-2.jsonl",
  cwd: "/tmp/work",
  permission_mode: "auto",
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "ls", description: "list files" },
  tool_use_id: "toolu_01",
};
const { body } = await handle(adapters.get("claude")!, payload, defaultPipeline());
console.log(JSON.stringify(body));
```

Expected output for that payload with the default pipeline, which adds no context and no decision:

```text
{}
```

The library is silent. `handle()` reports a decode, pipeline or encode failure to the `onError` callback in its optional fourth argument,
`handle(adapter, raw, pipeline, { onError })`, and a `Pipeline` reports a skipped or timed-out layer to the `onFault` option of
`new Pipeline({ onFault })`; without them nothing is printed.

`handle()` never throws. If decoding, a layer or encoding fails, the answer is `{}` (or the deny of a pipeline built to fail closed), so a
broken adapter does not stop the agent. A layer can add context, replace the reply or answer alone; see
the middleware section of the [architecture page](https://github.com/stateforge-labs/harness-kit/blob/main/docs/architecture.md).

## Exports

| Import | What |
| --- | --- |
| `@stateforge-labs/harness-hooks` | `adapters` (registry by harness id), `handle(adapter, raw, pipeline, options?)` (`HandleOptions`), `Pipeline` (per-layer `{ timeoutMs, onFault }`), `defaultPipeline`, `policyLayer`, `worktreeLayer`, `onKinds`, `mergeReplies`, `toolAllowlist`, `stopGuard`, `once`, `stripToolPrefix`, `denyText`, `continueText`, `policy`, the neutral types (`NeutralEvent`, `NeutralReply`, `HarnessAdapter`, ...), and the on-disk paths `shimPath`, `opencodePluginPath` and `schemasDir` |
| `@stateforge-labs/harness-hooks` (per harness) | `claudeSchemas`, `codexSchemas`, `opencodeSchemas` (hook name to zod schema), `claudeEnums`, `codexEnums`, `opencodeEnums` (closed value sets as zod enums), `claudeToolInputs`, `anyToolInput` and `checkToolInput` (Claude tool input schemas) |
| `@stateforge-labs/harness-hooks/endpoint` | The embeddable HTTP endpoint: `createHookHandler({ adapters, pipeline, admission, maxBodyBytes, onHandled? })` returns a web-standard `(req: Request) => Promise<Response>` serving `POST /hook/<harness>` and `GET /healthz`; `serveNode` (node:http) and `serveBun` bind it to a TCP port or a unix socket and return `{ address, close() }`. It reads no environment and writes no log |
| `renderCurlShim`, `parseCurlVersion`, `curlSupports`, `CURL_MIN_VERSION` | `renderCurlShim` renders a POSIX sh shim for one harness that posts with curl, over TCP or a unix socket, and takes the hook event name as its argument. It prints the server's JSON object, or `{}` on any failure; with `failClosed` it prints the refusal for PreToolUse and PermissionRequest, pre-rendered per event. The token is read from `HOOK_TOKEN` by curl itself (curl 8.3.0 or later) or from a header file (curl 7.55.0 or later), never an argument |
| `@stateforge-labs/harness-hooks/shim` | The command shim. It reads a hook payload from stdin and posts it to `POST /hook/<harness>`. It fails open to `{}`; with `HOOK_SHIM_FAIL=closed` it refuses PreToolUse and PermissionRequest instead |
| `@stateforge-labs/harness-hooks/opencode-plugin` | The OpenCode plugin. It adds the rules to each model request and throws on a deny. It fails open, or closed with `HOOK_PLUGIN_FAIL=closed` |
| `@stateforge-labs/harness-hooks/schemas/*` | JSON Schema per harness event, generated from the zod schemas (documentation only) |

### Embed the endpoint on Node

A pipeline that allows only `Read` and `Grep`, served on a unix socket with a bearer token. `policyLayer` goes last, so it is the innermost layer:

```ts
import { adapters, Pipeline, policyLayer, toolAllowlist } from "@stateforge-labs/harness-hooks";
import { AdmissionMode, createHookHandler, serveNode } from "@stateforge-labs/harness-hooks/endpoint";

const pipeline = new Pipeline({ onFault: (message) => console.error(message) })
  .use(toolAllowlist({ allow: ["Read", "Grep"], deny: { reason: "only reading is allowed here", hint: "use Read or Grep" } }))
  .use(policyLayer);

const handler = createHookHandler({
  adapters,
  pipeline,
  admission: { mode: AdmissionMode.Token, token: process.env.HOOK_TOKEN! },
  maxBodyBytes: 1_000_000,
  onError: (message, error) => console.error(message, error),
});
const endpoint = await serveNode({ handler, listen: { socketPath: "/run/user/1000/hooks.sock" } });
console.log(endpoint.address);
await endpoint.close();
```

`serveBun` takes the same options and binds `Bun.serve`; call it under Bun only. `listen` is `{ port, host }` for TCP or `{ socketPath }`; the socket
file is removed on `close()`. Admission is a bearer token (constant-time compare) or `{ mode: AdmissionMode.Loopback }`, which accepts only a
loopback `Host` and a JSON content type. A body over `maxBodyBytes` is answered `413`.

### Stock layers

`stopGuard` lets a Stop or SubagentStop continue the agent at most `limit` times per session, `once` injects context the first time a session raises
one of the given kinds, and `stripToolPrefix` removes a prefix such as `mcp__server__` from the tool name before the layers below it see it:

```ts
import { Kind, Pipeline, once, policyLayer, stopGuard, stripToolPrefix, toolAllowlist } from "@stateforge-labs/harness-hooks";

const pipeline = new Pipeline()
  .use(stripToolPrefix("mcp__tools__"))
  .use(toolAllowlist({ allow: ["Read", "Grep"], deny: { reason: "not on the list" } }))
  .use(once(() => "Work in small steps.", { kinds: [Kind.SessionStart] }))
  .use(stopGuard({ limit: 3, reason: "Finish the open items first." }))
  .use(policyLayer);
```

A layer passes a changed context down with `next(ctx)`; `stripToolPrefix` does this with the stripped name.

### Curl shim

`renderCurlShim` returns the text of a POSIX sh script that a command hook can run instead of starting a JavaScript process. It needs curl 7.55.0 or later
(`CURL_MIN_VERSION`; `curlSupports(parseCurlVersion(output), source)` checks `curl --version` output, and `pickCurlTokenSource(version, tokenConfigured)` chooses the mechanism). `tokenSource` selects how the token reaches curl: `"env"` (default; curl 8.3.0 or later) reads `HOOK_TOKEN` at call time with `--variable` and `--expand-header`; `"file"` (curl 7.55.0 or later) reads a curl header file at `tokenFile` holding `authorization: Bearer <token>` (`renderCurlTokenFile(token)` renders it; write it with mode 0600); `"none"` (curl 7.55.0 or later) sends no authorization, for a loopback or user-only socket server:

```ts
import { writeFileSync } from "node:fs";
import { renderCurlShim } from "@stateforge-labs/harness-hooks";

writeFileSync("hook-claude.sh", renderCurlShim({ harness: "claude", socketPath: "/run/user/1000/hooks.sock", failClosed: true }), { mode: 0o755 });
```

The hook event name is the script's only argument. The token is never written into the script and is never a curl argument.

Anything not listed is internal. The package ships only `dist/` and `schemas/`. The captured and synthetic payloads, with their `.expected.json`
and `.log.json` snapshots, live in the repository under [`packages/hooks/fixtures/`](https://github.com/stateforge-labs/harness-kit/tree/main/packages/hooks/fixtures).

## Supported harness events

| Harness | Events |
| --- | --- |
| Claude Code | every event in `schemas/claude/`, from `ConfigChange` to `WorktreeRemove` |
| Codex | `PostModelRequest`, `PreToolUse`, `PostToolUse`, `SessionStart` and the others in `schemas/codex/` |
| OpenCode | the events in `schemas/opencode/` (for example `tool.execute.before` and `session.prompt`) |

Each event's JSON Schema is in `schemas/<harness>/<Event>.json`. The zod schema is the source of truth, and the JSON Schema is generated
from it.

## Documentation

- [Architecture](https://github.com/stateforge-labs/harness-kit/blob/main/docs/architecture.md): how the pieces fit, the request path, the middleware contract and the adapters.
- [Decisions](https://github.com/stateforge-labs/harness-kit/blob/main/docs/decisions/): why the library is split into layers, and why the log is an allowlist.
- [Server](https://github.com/stateforge-labs/harness-kit/blob/main/packages/hooks-server/README.md): the HTTP service that runs this library behind `POST /hook/<harness>`.

## Contributing, security and support

[CONTRIBUTING.md](https://github.com/stateforge-labs/harness-kit/blob/main/CONTRIBUTING.md) explains the scripts, tests and layout.
[SECURITY.md](https://github.com/stateforge-labs/harness-kit/blob/main/SECURITY.md) explains how to report a vulnerability.
Questions and bug reports go to [GitHub issues](https://github.com/stateforge-labs/harness-kit/issues).

## License

MIT. See [LICENSE](LICENSE).
