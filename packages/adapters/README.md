# @stateforge-labs/harness-adapters

Harness knowledge that is not a hook, for Claude Code, Codex and OpenCode: transcript and store readers, in-flight and background
detection, CLI invocation, usage and context windows, tool facts and TUI screen chrome. One module per harness. It is built on
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

| Import | What |
| --- | --- |
| `@stateforge-labs/harness-adapters` | `adapterEnv`, `EnvVar`, `AdapterEnv`, `EnvSource` |
| `@stateforge-labs/harness-adapters/claude` | the Claude Code module |
| `@stateforge-labs/harness-adapters/codex` | the Codex module |
| `@stateforge-labs/harness-adapters/opencode` | the OpenCode module |
| `@stateforge-labs/harness-adapters/opencode/store` | the OpenCode store reader. It imports `node:sqlite`, which prints an `ExperimentalWarning` on Node 22 (checked on 22.23); the other subpaths never load it |
| `@stateforge-labs/harness-adapters/tui` | the TUI screen chrome |

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

The patterns carry no `g` or `y` flag, so `test()` is stateless. The Claude list is the tab-recap screen reader's list, with the empty prompt widened to accept a no-break space after the chevron (the captured idle screen has one). The Codex
and OpenCode lists were built from their idle screens (`fixtures/codex/screens/idle.txt`, `fixtures/opencode/screens/idle.txt`).

Anything not listed is internal. The `bun` export condition points at `src/`. Every other runtime gets `dist/`.

## License

MIT. See [LICENSE](LICENSE).
