// Delegation rules injected as additionalContext. Keep short: every token is
// paid in each session and in each subagent. Mirrors dotfiles
// config/claude-code/hooks/delegation-rules.sh (the offline fallback).

export const SESSION_START_RULES = `Delegation rules (harness-hooks server):
- Delegate to a subagent, model haiku (ask the user before using any other model), when: you only need the conclusion of a web/docs fetch or search; a task needs 3+ reads of files you don't already know; or output is likely >5K tokens. Do trivial lookups yourself.
- Launch independent lookups in parallel, in one message.
- Brief = goal, exact paths, return format with a word limit, tool-call budget, stop condition. Never paste conversation history. Put shared instructions first and the per-item part last, so fan-outs share the prompt cache.
- Use a fork only when the task needs most of this conversation's context.`;

export const SUBAGENT_START_RULES = `Subagent rules (harness-hooks server):
- Return a short, structured result; honour any word limit in your brief.
- Read file ranges, not whole files. Stay inside the tool-call budget in your brief and stop when done.
- Do not consult the advisor unless blocked, and at most once before finishing: each call re-reads your whole transcript at Opus rates.
- Do not spawn further agents unless the brief says so.`;

import type { Rules } from "../../core/policy.ts";
import { spawnAdvice } from "./spawn.ts";

/** What the Claude adapter gives the core policy to say. */
export const claudeRules: Rules = {
  sessionStart: SESSION_START_RULES,
  subagentStart: SUBAGENT_START_RULES,
  spawnAdvice,
};
