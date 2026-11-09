import { createRuntime, Harness } from "../src/runtime/index.ts";

const QUESTION = "What is a monad, in one sentence?";

async function main(): Promise<number> {
  await using runtime = createRuntime();
  const claude = runtime.headless(Harness.Claude, {
    credential: { mode: "login-store", acknowledgePolicy: true },
  });
  const result = await claude.run({ instructions: "Answer in one short sentence.", input: QUESTION });
  if (!result.ok) {
    console.error(`${result.failure.kind}: ${result.failure.message}`);
    return 1;
  }
  console.log(result.value.text);
  return 0;
}

process.exitCode = await main();
