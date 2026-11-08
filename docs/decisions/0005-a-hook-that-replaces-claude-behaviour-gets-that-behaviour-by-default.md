# A hook that replaces Claude Code's own behaviour gets that behaviour by default

Status: **accepted** (owner decided on 2026-11-07). Amends [ADR 0003](0003-the-server-observes-and-never-blocks-on-its-own.md).
Research: Claude Code's hooks reference as captured in
[R-2026-11-07-03](../research/studies/2026-11-07-claude-code-hook-surface/README.md) (`evidence/docs/hooks.md`, WorktreeCreate and
WorktreeRemove), and the probes below.

## Context and Problem Statement

ADR 0003 says the server only observes and answers passively. For two Claude Code events a passive answer is not neutral. Installing a
`WorktreeCreate` or `WorktreeRemove` hook **replaces** Claude's own git handling:

- `WorktreeCreate` over HTTP must answer `hookSpecificOutput.worktreePath`, or the creation fails. The passive `{}` broke every
  `claude --worktree` and every worktree a subagent asked for, and the default installed hooks block includes the event.
- `WorktreeRemove` counts a successful answer as "removed" and reads nothing else, so `{}` left the directory on disk.

The owner wants the hooks to handle every event they install, even when no consumer uses it.

## Decision Outcome

**When installing a hook replaces Claude Code's built-in behaviour, the server's default for that event is the built-in behaviour.** A
consumer layer can still answer instead, and the default then does nothing.

For the worktree events that default is `worktreeLayer` (`packages/hooks/src/core/worktree.ts`). It sits below the consumer layers and
above `policyLayer`, in the server and in `defaultPipeline()`, and does what Claude Code does without hooks:

| | Claude Code without hooks (probed with `claude -p -w`, 2.1.319, 2026-11-07) | `worktreeLayer` |
| --- | --- | --- |
| Where | `<repository root>/.claude/worktrees/<name>`, also when started from a subfolder | the same; the root is the parent of git's common dir, so a call from inside a worktree still uses the main repository |
| Branch | `worktree-<name>`, no upstream | the same (`--no-track`); an existing `worktree-<name>` branch is checked out again |
| Base | `origin`'s branch (the commit pushed, not a newer local one); `HEAD` without a remote | `origin/HEAD`, else `origin/main`, else `origin/master`, else `HEAD`; it never fetches |
| Same name again | | answers the existing worktree's path |
| Lock | locked with Claude's own session and pid | not locked: the server has no Claude pid |
| Remove | `git worktree remove`, and the branch is deleted | `git worktree remove --force --force`, then `git branch -d worktree-<name>`, which keeps a branch that has commits not in `HEAD` |

Safety: the name must be a slug (`[A-Za-z0-9][A-Za-z0-9._-]*`), so it cannot leave `.claude/worktrees`. A removal acts only on a path that
is exactly `<root>/.claude/worktrees/<name>` and a registered worktree of that repository. Anything else is answered as before and
changes nothing. Git failures give no path, so Claude reports the failure itself, as it would without hooks.

The layer has its own timeout (`WORKTREE_TIMEOUT_MS`, 60 s), and the installer gives the two Claude hooks the same 60 s instead of 10 s,
because a checkout can take longer than the other layers' 2 s.

### Consequences

- Good: installing the default hooks block no longer changes how Claude Code's worktrees behave.
- Cost: the server now changes files, in the repository Claude names. It must share a filesystem with Claude Code, which the loopback
  rule already implies. A consumer that wants no worktree effect must answer the event itself.
- Not covered: Claude's `worktree.baseRef: "head"` setting (the layer always takes the remote branch when there is one), and Claude's
  session lock.
- Observed once: in a `claude -p` run, `ExitWorktree` with `discard_changes: true` removed a hook-created worktree through Claude's git
  fallback without calling `WorktreeRemove`, and left its branch, as the docs say Claude does for hook-created worktrees. Whether
  interactive exits call the hook is in `docs/architecture.md`, Unresolved.

### Confirmation

`packages/hooks-server/test/e2e/worktree.test.ts` runs real git repositories against the real server: path, branch, base with and
without a remote, a subfolder, a repeated name, rejected names and folders, removal with a clean and a worked branch, a path outside
`.claude/worktrees` left alone, and a consumer layer that wins. `install.test.ts` checks the 60 s hook timeout. Live: with both hooks
in a throwaway repository's project settings, `claude -p -w live-wt` ran its session inside the worktree the server created.
