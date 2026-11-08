import type { Rules } from "../../core/policy.ts";

export const SESSION_START_RULES = `Delegation rules (harness-hooks server):
- Delegate to a subagent (the subagent tool) when: you only need the conclusion of a web/docs fetch or search; a task needs 3+ reads of files you don't already know; or output is likely >5K tokens. Do trivial lookups yourself.
- Launch independent lookups in parallel.
- Brief = goal, exact paths, return format with a word limit, tool-call budget, stop condition. Never paste conversation history. Put shared instructions first and the per-item part last, so fan-outs share the prompt cache.`;

export const SUBAGENT_START_RULES = `Subagent rules (harness-hooks server):
- Return a short, structured result; honour any word limit in your brief.
- Read file ranges, not whole files. Stay inside the tool-call budget in your brief and stop when done.
- Do not spawn further agents unless the brief says so.`;

export const opencodeRules: Rules = {
  sessionStart: SESSION_START_RULES,
  subagentStart: SUBAGENT_START_RULES,
};
