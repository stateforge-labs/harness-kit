import { createRuntime, Harness, TOOLS_OFF } from "../src/runtime/index.ts";

export async function planAnswer(question: string) {
  await using runtime = createRuntime();
  const claude = runtime.headless(Harness.Claude, {
    credential: { mode: "login-store", acknowledgePolicy: true },
    tools: TOOLS_OFF,
  });
  return claude.plan({ instructions: "Answer in one short sentence.", input: question });
}
