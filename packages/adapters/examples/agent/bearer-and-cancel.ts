import { createRuntime, Harness, secret, type AgentDirs, type RunFailure } from "../../src/runtime/index.ts";

export interface SearchInput {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly bearer: string;
  readonly endpoint: string;
  readonly dirs: AgentDirs;
  readonly path: string;
  readonly signal: AbortSignal;
}

export async function search(input: SearchInput): Promise<RunFailure | string> {
  await using runtime = createRuntime();
  const made = runtime.agent(Harness.Claude, {
    credential: { mode: "api-key", key: secret(input.apiKey), baseUrl: input.baseUrl },
    dirs: input.dirs,
    tools: {
      builtins: "off",
      mcp: [{ name: "docs", url: input.endpoint, bearer: secret(input.bearer), allow: ["search"] }],
      settings: "none",
    },
    env: { kind: "closed", set: { PATH: input.path } },
    idleTimeoutMs: 60_000,
  });
  if (!made.ok) {
    return made.failure;
  }
  const run = made.value.start({ instructions: "Use the docs search tool.", prompt: "Find the install page.", maxTurns: 8 });
  input.signal.addEventListener("abort", () => void run.cancel(), { once: true });
  const result = await run.settled;
  return result.ok ? result.value.text : result.failure;
}
