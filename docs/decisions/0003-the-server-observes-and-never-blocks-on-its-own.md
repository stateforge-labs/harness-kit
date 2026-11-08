# The server observes; it never blocks, denies or stops an agent on its own

Status: **accepted** (recorded 2026-11-07 from the code comments it was written in; the decisions date from the builds of R-2026-11-07-03, -05 and -08). Research: [R-2026-11-07-03](../research/studies/2026-11-07-claude-code-hook-surface/README.md), [R-2026-11-07-05](../research/studies/2026-11-07-claude-hook-surface-verified/README.md), [R-2026-11-07-08](../research/studies/2026-11-07-codex-opencode-real-hook-payloads/README.md), [R-2026-11-07-10](../research/studies/2026-11-07-mcp-hooks-feasibility-codex-opencode/README.md).

## Context and Problem Statement

harness-hooks sits in the hook path of three coding-agent harnesses. Every hook answer can change what the agent does: block a tool,
stop a turn, inject text the model reads. Harness versions change their payloads without notice. The question is what the server itself
(without a consumer's middleware) may decide.

## Decision Outcome

**The server and its clients only observe. Anything that blocks, denies, continues or rewrites comes from a middleware layer that a
consumer registers (contract v1, [ADR 0001](0001-library-layers-service-boundary.md)), never from the server, an adapter or a client on
its own.**

1. **Passive answers per harness.**
   - **Claude Code:** every event is answered `{}` except three that can carry `additionalContext`:
     - `SessionStart`, which gets the delegation rules;
     - `SubagentStart`, which gets the subagent rules;
     - `PreToolUse` for the `Agent` tool, which gets the spawn advisory only when it applies (the brief names no return format or word
       limit, or a non-Haiku model is asked for); otherwise `{}`.

     No handler blocks, denies, retries, edits input or output, sets `continue: false`, or returns a `systemMessage`.
   - **Codex:** `SessionStart` gets the delegation rules and `SubagentStart` the subagent rules (the owner approved the wording on
     2026-11-07); every other event is answered `{}`. There is no spawn advisory, since a Codex spawn names no model.
   - **OpenCode:** `session.context` gets the delegation rules, or the subagent rules in a child session, with the Codex wording naming
     the `subagent` tool; the plugin adds the text to each model request. Every other event is answered `{}`.
2. **Rules text belongs to an adapter.** It names that harness's models and tools, so one adapter's rules never reach another's sessions,
   and an adapter without rules stays passive. The policy is pure: the same event and rules always give the same reply. The Claude text is
   kept short because every token is paid in each session and each subagent. It mirrors the dotfiles
   `config/claude-code/hooks/delegation-rules.sh`, which is the offline fallback.
3. **Validation never rejects.** A missing key, a wrong type or a value outside a closed set is logged and the request is answered as
   usual. A damaged payload may change the answer but must never turn it into a block, a stop or a deny; the contract suite checks this on
   the first fixture of every event.
4. **Clients fail open by default.**
   - The shim prints `{}` and exits 0 when the server is down, slow, refusing or answering anything but a JSON object.
   - It prints `{}` and not nothing, because Codex needs a JSON object on stdout for `Stop`, `SubagentStop` and `Interrupt`.
   - It never exits 2, because Codex reads exit 2 as "block". A call with no `--harness` exits 1: a visible error that does not block.
   - The OpenCode plugin never throws into OpenCode except to deliver a deny.
   - Fail-closed is opt-in per client (`HOOK_SHIM_FAIL=closed`, `HOOK_PLUGIN_FAIL=closed`). Even then, only the pre-tool call (and the
     shim's `PermissionRequest`) is refused. A refusal on Stop would read as "keep going".
5. **Claude Code over HTTP.** Hooks are installed without a matcher, so each hook sees every occurrence. Claude treats a non-2xx or
   unreachable http hook as non-blocking. Fail-closed for Claude's HTTP hooks is therefore Claude's own setting (`onFailure: "block"`, per
   its docs), not the server's.

### Consequences

- Good: a new harness version or a broken server cannot stop an agent; a consumer decides every effect explicitly and in one place.
- Cost: `WorktreeCreate` over HTTP needs a `worktreePath` in the answer or Claude fails the creation (per its docs), so the passive `{}`
  breaks worktree creation with the default installed hooks block, which includes `WorktreeCreate`. It is listed in `docs/architecture.md`, Unresolved.

### Confirmation

`packages/hooks-server/test/e2e/contract.test.ts`: every fixture answers its snapshot. On the first fixture of each event:
- every required key (except `session_id`) is removed one at a time and logged as missing;
- one required string key is retyped to a number and logged as `wrong_type`;
- each closed-set key is set to an unlisted value and logged as `invalid_value`.

Every one of these answers stays 200 and carries no block, deny or `continue: false`.
`packages/hooks-server/test/e2e/shim.test.ts` and `shim-fail-closed.test.ts` check exit codes and bodies.
