import { createRuntime, Harness, secret, TOOLS_OFF, type AgentOptions } from "../../src/runtime/index.ts";
import { fakeAgentEngine, fakeFs } from "../../src/testing/index.ts";

const DIRS = { cwd: "/work/cwd", home: "/work/home", configDir: "/work/config", tmpDir: "/work/tmp" };

const OPTIONS: AgentOptions = {
  credential: { mode: "api-key", key: secret("placeholder-key"), baseUrl: "http://127.0.0.1:1" },
  dirs: DIRS,
  tools: TOOLS_OFF,
  env: { kind: "closed", set: { PATH: "/usr/bin" } },
};

export async function scriptedAnswer(): Promise<string | null> {
  const engine = fakeAgentEngine(Harness.Claude, [
    {
      events: [
        { kind: "started", engine: "sdk" },
        { kind: "turn", n: 1 },
        { kind: "text", text: "four" },
        { kind: "usage", turn: 1, model: "model-a", input: 3, cacheWrite: 0, cacheRead: 0, output: 1 },
      ],
    },
  ]);
  await using runtime = createRuntime({ fs: fakeFs({ dirs: Object.values(DIRS) }), agentEngines: { claude: engine } });
  const made = runtime.agent(Harness.Claude, OPTIONS);
  if (!made.ok) {
    return null;
  }
  const result = await made.value.start({ instructions: "Be brief.", prompt: "2 + 2?", maxTurns: 1 }).settled;
  return result.ok ? result.value.text : null;
}
