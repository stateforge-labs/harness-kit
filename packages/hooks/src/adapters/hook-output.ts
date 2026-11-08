import { continueText, denyText, type NeutralReply } from "../core/reply.ts";

export interface HookOutputRules {
  preTool: string;
  permission: string;
  context: ReadonlySet<string>;
  stop: ReadonlySet<string>;
  worktreeCreate?: string;
}

export function encodeHookOutput(reply: NeutralReply, native: string | undefined, rules: HookOutputRules): Record<string, unknown> {
  if (!native) return {};
  if (native === rules.preTool && reply.deny) {
    return { hookSpecificOutput: { hookEventName: native, permissionDecision: "deny", permissionDecisionReason: denyText(reply.deny) } };
  }
  if (native === rules.permission) {
    if (reply.deny) return { hookSpecificOutput: { hookEventName: native, decision: { behavior: "deny", message: denyText(reply.deny) } } };
    if (reply.allow) return { hookSpecificOutput: { hookEventName: native, decision: { behavior: "allow" } } };
    return {};
  }
  if (native === rules.worktreeCreate) return reply.worktree ? { hookSpecificOutput: { hookEventName: native, worktreePath: reply.worktree.path } } : {};
  if (rules.stop.has(native)) return reply.continue ? { decision: "block", reason: continueText(reply.continue) } : {};
  if (reply.context && rules.context.has(native)) return { hookSpecificOutput: { hookEventName: native, additionalContext: reply.context } };
  return {};
}
