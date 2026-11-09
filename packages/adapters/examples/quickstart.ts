import { createRuntime, Harness } from "../src/runtime/index.ts";

export async function answer(question: string): Promise<string> {
  await using runtime = createRuntime();
  const claude = runtime.headless(Harness.Claude, {
    credential: { mode: "login-store", acknowledgePolicy: true },
  });
  const result = await claude.run({ instructions: "Answer in one short sentence.", input: question });
  if (!result.ok) {
    throw new Error(result.failure.message);
  }
  return result.value.text;
}
