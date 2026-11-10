import { Engine, ENGINE_CAPABILITY, UnsupportedReason } from "../core/capability.ts";
import type { RunFailure } from "../core/failure.ts";
import { fail, type Result } from "../core/result.ts";
import { AgentMessage } from "./constants.ts";
import type { Agent, AgentOptions } from "./types.ts";

export function agentOf(_id: string, _options: AgentOptions): Result<Agent, RunFailure> {
  return fail({
    kind: "unsupported",
    message: AgentMessage.EngineUnavailable,
    capability: ENGINE_CAPABILITY,
    engine: Engine.Sdk,
    why: UnsupportedReason.NotImplemented,
  });
}
