import { Pipeline, toolAllowlist } from "@stateforge-labs/harness-hooks";
import { createRuntime, Harness, secret, TOOLS_OFF, type AgentDirs, type AgentOutput, type RunFailure } from "../../src/runtime/index.ts";

export interface AskInput {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly dirs: AgentDirs;
  readonly path: string;
  readonly question: string;
}

export async function ask(input: AskInput): Promise<AgentOutput | RunFailure> {
  await using runtime = createRuntime();
  const made = runtime.agent(Harness.Claude, {
    credential: { mode: "api-key", key: secret(input.apiKey), baseUrl: input.baseUrl },
    dirs: input.dirs,
    tools: TOOLS_OFF,
    env: { kind: "closed", set: { PATH: input.path } },
    timeoutMs: 120_000,
  });
  if (!made.ok) {
    return made.failure;
  }
  const pipeline = new Pipeline().use(toolAllowlist({ allow: [], deny: { reason: "no tools in this run" } }));
  const run = made.value.start({
    instructions: "Answer in one short sentence.",
    prompt: input.question,
    maxTurns: 3,
    hooks: { pipeline, socket: null },
  });
  for await (const event of run.events) {
    if (event.kind === "refused") {
      console.error(`refused ${event.tool}: ${event.reason}`);
    }
  }
  const result = await run.settled;
  return result.ok ? result.value : result.failure;
}
