import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntime, Harness, secret, TOOLS_OFF } from "../../src/runtime/index.ts";

const QUESTION = "What is a monad, in one sentence?";

async function main(): Promise<number> {
  const root = await mkdtemp(join(tmpdir(), "agent-quickstart-"));
  try {
    const dirs = { cwd: join(root, "cwd"), home: join(root, "home"), configDir: join(root, "config"), tmpDir: join(root, "tmp") };
    for (const dir of Object.values(dirs)) {
      await mkdir(dir);
    }
    await using runtime = createRuntime();
    const made = runtime.agent(Harness.Claude, {
      credential: { mode: "api-key", key: secret(process.env["ANTHROPIC_API_KEY"] ?? ""), baseUrl: process.env["ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com" },
      dirs,
      tools: TOOLS_OFF,
      env: { kind: "closed", set: { PATH: process.env["PATH"] ?? "" } },
    });
    if (!made.ok) {
      console.error(`${made.failure.kind}: ${made.failure.message}`);
      return 1;
    }
    const run = made.value.start({ instructions: "Answer in one short sentence.", prompt: QUESTION, maxTurns: 3 });
    for await (const event of run.events) {
      if (event.kind === "text") {
        process.stdout.write(event.text);
      }
    }
    const result = await run.settled;
    if (!result.ok) {
      console.error(`${result.failure.kind}: ${result.failure.message}`);
      return 1;
    }
    return 0;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

process.exitCode = await main();
