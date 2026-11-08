# The event log is an allowlist of labels and counts

Status: **accepted** (recorded 2026-11-07 from the code comments it was written in). Research: [R-2026-11-07-05](../research/studies/2026-11-07-claude-hook-surface-verified/README.md), [R-2026-11-07-08](../research/studies/2026-11-07-codex-opencode-real-hook-payloads/README.md).

## Context and Problem Statement

Hook payloads carry prompts, tool arguments (shell commands that can hold an inline token or a URL with credentials), tool output, model
messages and file paths. The server writes one log line per event so events can be counted per session and agent. The question is what
may be written.

## Decision Outcome

**Only what a handler names is logged: structural labels and counts. Nothing typed by a person or produced by a model is logged.**

1. **What a line holds.** The common fields (harness, event, session, agent id and type, tool name), the key names present, the
   validation result, and each event handler's `meta`. Allowed in `meta`:
   - trigger, source, tool name, permission mode, subagent type, model alias;
   - exit code number, abort flag, duration, MCP server name and source, the `PreModelSwitch` pricing label (`catalog`);
   - error category, counts, and whether advice was given.
2. **Never logged:**
   - prompt text and attached files;
   - tool input (command, path, subagent brief), tool output, error text and error details;
   - `last_assistant_message`, compact summaries, custom instructions;
   - directory and worktree paths, transcript paths;
   - task subjects and descriptions, session titles, message deltas, cost amounts;
   - the commands and paths an OpenCode `permission.evaluate` touches (only counted).

   An error is reduced to a label or a boolean; Codex `PostModelRequest`, for example, logs its outcome and token counts, never the error
   text.
3. **Typed values only for identifiers and enumerations.** A key may be logged as its value only when that value is a short identifier
   or a member of a closed set. Examples: the `SessionEnd` reason, the `PermissionDenied` classifier tag, OpenCode's permission effect,
   prompt delivery and source type. A string-typed payload value must not appear anywhere else in the line, except as a handler's own
   short label (for example `FileChanged` logs its event as `change`).
4. **Defensive limits.**
   - A common field is logged only when it is a string; an object or array from a damaged or hostile payload would otherwise be written whole.
   - Strings are cut at 256 characters, and at most 100 key names are listed.
   - The validation result carries dotted paths and expected types, never values.
   - `meta` never changes a line field: it is spread after the common fields, so a key named `event` would overwrite the line's event.
     That is why `FileChanged` logs its event as `change`. A handler may repeat a common field (`tool_name`, `agent_id`, `agent_type`,
     `session_id`) only with the same value, `null` when the payload's value is not a string.
5. **The file.** It is created readable by its owner only, because `HOOK_LOG_PAYLOAD=1` stores whole bodies. That mode exists only to
   study real payload shapes before a feature is built.
6. **Fixtures follow the same rule.** `packages/hooks/scripts/export-fixtures.ts` replaces free text (typed by a person or produced by a model, Codex
   tool output, OpenCode `permission.evaluate` commands and paths), scrubs random ids (`messageID`, `projectID`, `parentID`, call and part
   ids) and the generated slug. OpenCode's object-valued `model` reference is kept as it is, because it names no one. A short shell command was once passed through, and a command can carry a secret.
   - The captures are masked (home → `~`) before they are committed, so the exporter reads a leading `~/` as the home directory and the
     path rules still apply. All fixtures were re-exported on 2026-11-07 with the full free-text list; the answer and log snapshots did not
     change.

### Confirmation

`packages/hooks-server/test/e2e/contract.test.ts` writes `SECRET<key>` into every string key of every fixture and checks that none of it
reaches the log, apart from the keys on its allowlist (`MAY_LOG`). Each fixture's `.log.json` pins the whole entry (keys, order and
values) except the timestamp and the session id. `log-cap.test.ts` checks the 256-character cut and the 100-key limit. `packages/hooks/test/log-meta-keys.test.ts` checks, for
every fixture, that no handler's `meta` uses a reserved line field or changes a common field.
