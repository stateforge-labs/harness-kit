import type { RunFailure } from "../core/failure.ts";
import type { Result } from "../core/result.ts";
import { SESSION_NOT_FOUND } from "./constants.ts";
import type { AgentOutput, AgentStart } from "./types.ts";

export function recoverable(start: AgentStart): boolean {
  return start.resume?.recoveryPrompt !== undefined;
}

export function recoveryStart(start: AgentStart): AgentStart {
  return { ...start, prompt: start.resume?.recoveryPrompt ?? start.prompt, resume: undefined };
}

export function missedSession(result: Result<AgentOutput, RunFailure>): boolean {
  return !result.ok && result.failure.kind === SESSION_NOT_FOUND;
}
