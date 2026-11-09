# Hook endpoint load test

A [k6](https://k6.io) script that drives `POST /hook/claude` with many agents at once.

## What it measures

The hook server under concurrent hooks. Each virtual user is one agent. Each iteration is one tool call: a `PreToolUse` payload, a think
time, a `PostToolUse` payload, a think time. The payloads are the repository fixtures `PreToolUse/01-write.json` and
`PostToolUse/01-write.json` under `packages/hooks/fixtures/claude`, sent with a per-agent `session_id` and a per-call `tool_use_id`.

The run fails if any request fails, if any answer is not a status 200 with a JSON object body, or if the p95 latency is over the budget.

## What it does not measure

The cost of starting a shim process. Each real hook call spawns a new shim process before it reaches the server, and that start-up
dominates the time an agent waits. This test sends requests from one long-lived process, so it shows only the server's share.

k6 cannot target a unix socket (k6 2.3.0 rejects `unix://` and `http+unix://` URLs as unsupported schemes), so this test runs over loopback TCP only.

## Requirements

k6 2.3.0, pinned in the repository `mise.toml`. Bun 1.4.4 for the server.

## Run

Start the server on a free loopback port, with an empty token and the event log in a temporary directory:

```sh
cd packages/hooks-server
PORT=8787 HOOK_TOKEN= HOOK_LOG_FILE="$(mktemp -d)/events.jsonl" bun run start
```

In another terminal, from `packages/hooks-server/load`:

```sh
SCENARIO=agents10 mise exec k6@2.3.0 -- k6 run hook-load.js
SCENARIO=agents50 mise exec k6@2.3.0 -- k6 run hook-load.js
```

Each scenario runs for 30 seconds. `SCENARIO` defaults to `agents10`.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOOK_URL` | `http://127.0.0.1:8787` | Base URL of the server |
| `HOOK_TOKEN` | empty | Bearer token; no `Authorization` header when empty |
| `SCENARIO` | `agents10` | `agents10` or `agents50` |
| `VUS_SMALL` | `10` | Virtual users of `agents10` |
| `VUS_LARGE` | `50` | Virtual users of `agents50` |
| `DURATION` | `30s` | How long a scenario runs |
| `THINK_MS` | `100` | Think time after each request |
| `P95_BUDGET_MS` | `25` | p95 latency budget in milliseconds |

## Budget

The first measured runs on a loopback server gave a p95 of 2.5 to 4.5 ms for 10 agents and 2.5 to 3.5 ms for 50 agents (about 98
and 490 requests per second). The budget is 25 ms: several times the measured p95, so a busy machine does not fail the run, and tight
enough to catch a real regression. It is the constant `P95_BUDGET_MS` in `constants.js`.
